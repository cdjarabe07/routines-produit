import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BookOpen, MessageSquarePlus, RotateCcw, TriangleAlert } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { TextAreaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/Progress';
import { AnomalyForm } from '@/features/anomalies/components/AnomalyForm';
import { KnowledgeQuickView } from '@/features/knowledge/components/KnowledgeQuickView';
import { CheckResultToggle } from '@/features/shared/components/CheckResultToggle';
import { useLookups, useSettings } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { CheckResult, ItemResult, RoutineItem, RoutineTemplate, Workstation } from '@/types/domain';
import { formatLongDate, formatTime, todayKey } from '@/utils/date';
import { useRecordItem } from '../api';
import { ROUTINE_STATE, canEditRun, findRun, routineState, runProgress } from '../model';
import styles from './RoutineRunPage.module.css';

export function RoutineRunPage() {
  const { templateId = '', date = todayKey() } = useParams();
  const templates = useCollection('routineTemplates');
  const runs = useCollection('routineRuns');
  const { queries, lookups } = useLookups();

  return (
    <QueryBoundary queries={[templates, runs, ...queries]}>
      {() => {
        const template = templates.data!.find((t) => t.id === templateId);
        if (!template) {
          return <EmptyState title="Routine introuvable" description="Ce modèle de routine n’existe plus." action={<Link to="/routines">Retour aux routines</Link>} />;
        }
        return <RunView template={template} date={date} run={findRun(runs.data!, template.id, date)} userName={lookups!.userName} workstations={lookups!.workstations} />;
      }}
    </QueryBoundary>
  );
}

interface RunViewProps {
  template: RoutineTemplate;
  date: string;
  run: ReturnType<typeof findRun>;
  userName: (id?: string) => string;
  workstations: Workstation[];
}

function RunView({ template, date, run, userName, workstations }: RunViewProps) {
  const user = useCurrentUser();
  const { can } = useAuth();
  const now = useNow(60_000);
  const today = todayKey();
  const { settings } = useSettings();
  const record = useRecordItem();
  const [knowledgeId, setKnowledgeId] = useState<string | null>(null);
  const [anomalyFor, setAnomalyFor] = useState<RoutineItem | null>(null);

  const editable = canEditRun(template, user.role, can('routine.manage'), date, today);
  const progress = runProgress(template, run);
  const state = routineState(template, run, date, today, now, settings.routineLateToleranceMinutes);

  const save = (item: RoutineItem, status: CheckResult | null, comment?: string, anomalyId?: string) =>
    record.mutateAsync({ template, date, itemId: item.id, status, comment, anomalyId, userId: user.id });

  const readOnlyReason = useMemo(() => {
    if (editable) return null;
    if (date !== today) return 'Journée passée : consultation uniquement.';
    return `Cette routine est réservée au rôle ${ROLE_LABELS[template.role]}.`;
  }, [editable, date, today, template.role]);

  return (
    <>
      <PageHeader
        back={{ to: date === today ? '/routines' : `/routines?date=${date}`, label: 'Routines' }}
        title={template.title}
        description={template.description}
        meta={
          <>
            <Badge tone={ROUTINE_STATE[state].tone}>{ROUTINE_STATE[state].label}</Badge>
            <span className={styles.metaText}>Prévue à {template.scheduledTime} · {ROLE_LABELS[template.role]} · {formatLongDate(date)}</span>
          </>
        }
      />

      <div className={styles.progressBar}>
        <Progress value={progress.treated} max={progress.total} label="Avancement de la routine" tone={state === 'done' ? 'success' : 'info'} />
        <span className={styles.progressText}>
          {progress.treated}/{progress.total} points
          {progress.ko > 0 && <Badge tone="danger">{progress.ko} non conforme{progress.ko > 1 ? 's' : ''}</Badge>}
        </span>
      </div>

      {readOnlyReason && <p className={styles.readonly} role="note">{readOnlyReason}</p>}

      <Stack gap={4}>
        {template.sections.map((section) => (
          <Panel key={section.id} title={template.sections.length > 1 ? section.title : undefined} flush>
            <ul className={styles.items}>
              {section.items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  result={run?.results[item.id]}
                  editable={editable}
                  busy={record.isPending && record.variables?.itemId === item.id}
                  userName={userName}
                  onOpenKnowledge={setKnowledgeId}
                  onSave={async (status, comment) => {
                    await save(item, status, comment);
                    if (status === 'ko' && !run?.results[item.id]?.anomalyId && can('anomaly.create')) setAnomalyFor(item);
                  }}
                  onDeclare={() => setAnomalyFor(item)}
                />
              ))}
            </ul>
          </Panel>
        ))}
      </Stack>

      {state === 'done' && (
        <p className={styles.done} role="status">
          Routine terminée{run?.completedAt ? ` à ${formatTime(run.completedAt)}` : ''}.
        </p>
      )}

      <KnowledgeQuickView knowledgeId={knowledgeId} onClose={() => setKnowledgeId(null)} />

      <Modal
        open={anomalyFor !== null}
        onClose={() => setAnomalyFor(null)}
        title="Déclarer une anomalie ?"
        description="Le point est enregistré comme non conforme. Déclarez une anomalie pour en assurer le suivi, ou fermez cette fenêtre."
        size="md"
      >
        {anomalyFor && (
          <AnomalyForm
            workstations={workstations}
            origin={{ type: 'routine', id: run?.id }}
            initial={{ description: `${template.title} — ${anomalyFor.label}`, category: 'standard' }}
            onCancel={() => setAnomalyFor(null)}
            onCreated={async (anomaly) => {
              const current = run?.results[anomalyFor.id];
              await save(anomalyFor, 'ko', current?.comment, anomaly.id);
              setAnomalyFor(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

interface ItemRowProps {
  item: RoutineItem;
  result?: ItemResult;
  editable: boolean;
  busy: boolean;
  userName: (id?: string) => string;
  onOpenKnowledge: (id: string) => void;
  onSave: (status: CheckResult | null, comment?: string) => Promise<unknown>;
  onDeclare: () => void;
}

function ItemRow({ item, result, editable, busy, userName, onOpenKnowledge, onSave, onDeclare }: ItemRowProps) {
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState(result?.comment ?? '');

  return (
    <li className={styles.item} data-status={result?.status ?? 'none'}>
      <div className={styles.itemMain}>
        <div className={styles.itemText}>
          <span className={styles.itemLabel}>{item.label}</span>
          {result && (
            <span className={styles.itemMeta}>
              {userName(result.by)} · {formatTime(result.at)}
              {result.comment && <> · « {result.comment} »</>}
            </span>
          )}
          {result?.anomalyId && (
            <Link to={`/anomalies/${result.anomalyId}`} className={styles.anomalyLink}>
              <TriangleAlert size={14} aria-hidden /> Anomalie liée
            </Link>
          )}
        </div>
        <div className={styles.itemControls}>
          {item.knowledgeId && (
            <IconButton label="Voir le standard associé" icon={<BookOpen size={18} />} onClick={() => onOpenKnowledge(item.knowledgeId!)} />
          )}
          {editable && (
            <IconButton label="Ajouter un commentaire" icon={<MessageSquarePlus size={18} />} onClick={() => setCommentOpen((o) => !o)} aria-expanded={commentOpen} />
          )}
          <CheckResultToggle
            itemLabel={item.label}
            value={result?.status}
            disabled={!editable || busy}
            onChange={(status) => void onSave(status, comment || result?.comment)}
          />
        </div>
      </div>

      {editable && result?.status === 'ko' && !result.anomalyId && (
        <div className={styles.itemFollowUp}>
          <Button size="sm" variant="secondary" icon={<TriangleAlert size={15} aria-hidden />} onClick={onDeclare}>Déclarer une anomalie</Button>
        </div>
      )}

      {editable && commentOpen && (
        <div className={styles.itemFollowUp}>
          <TextAreaField label="Commentaire" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Précision, mesure, preuve…" />
          <div className={styles.commentActions}>
            <Button size="sm" onClick={() => setCommentOpen(false)}>Fermer</Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!result}
              title={result ? undefined : 'Choisissez d’abord un résultat'}
              onClick={async () => {
                await onSave(result!.status, comment);
                setCommentOpen(false);
              }}
            >
              Enregistrer le commentaire
            </Button>
          </div>
        </div>
      )}

      {editable && result && (
        <button type="button" className={styles.undo} onClick={() => void onSave(null)}>
          <RotateCcw size={12} aria-hidden /> Annuler la saisie
        </button>
      )}
    </li>
  );
}
