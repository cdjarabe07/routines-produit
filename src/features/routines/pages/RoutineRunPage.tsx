import { categoryOr } from '@/app/catalog';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BookOpen, CheckCircle2, Clock, MessageSquare, Play, RotateCcw, TriangleAlert } from 'lucide-react';
import { useAuth, useCurrentUser } from '@/app/providers/AuthProvider';
import { AccessDenied, EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/Progress';
import { AnomalyForm } from '@/features/anomalies/components/AnomalyForm';
import { useCreateAnomaly } from '@/features/anomalies/api';
import { PhotoInput } from '@/components/ui/PhotoInput';
import { TextAreaField } from '@/components/ui/Field';
import { useCollection } from '@/hooks/useData';
import { KnowledgeQuickView } from '@/features/knowledge/components/KnowledgeQuickView';
import { usePlanningData } from '@/features/planning/api';
import {
  OCCURRENCE_STATE,
  assignmentLabel,
  findOccurrence,
  isAssignedTo,
  isMultiSlot,
  occurrenceState,
  type Occurrence,
  occurrencePath,
  slotFromParam,
} from '@/features/planning/model';
import { useLookups, useSettings, type Lookups } from '@/features/shared/api';
import { CheckResultToggle } from '@/features/shared/components/CheckResultToggle';
import { CommentThread } from '@/features/shared/components/CommentThread';
import { PRIORITY } from '@/features/shared/labels';
import { useNow } from '@/hooks/useNow';
import { ROLE_LABELS } from '@/services/auth/permissions';
import type { Checklist, ChecklistItem, CheckResult, CheckValue, ID, ItemResult, RoutineRun, RoutineTask, RunPhoto } from '@/types/domain';
import { formatDuration, formatLongDate, formatTime, todayKey } from '@/utils/date';
import { useAddRunPhoto, useCompleteRoutine, useRecordResult, useStartRoutine } from '../api';
import { CheckInput } from '../components/CheckInput';
import { checkKey, checkMissing, estimatedMinutes, formatCheckValue, runSummary, taskChecks, taskProgress, type TaskState } from '../model';
import styles from './RoutineRunPage.module.css';

const TASK_STATE: Record<TaskState, { label: string; tone: 'neutral' | 'info' | 'success' }> = {
  todo: { label: 'À faire', tone: 'neutral' },
  partial: { label: 'En cours', tone: 'info' },
  done: { label: 'Faite', tone: 'success' },
};

/** Exécution d'une routine planifiée : Démarrer → tâches et contrôles → Terminer (durée réelle enregistrée). */
export function RoutineRunPage() {
  const { scheduleId = '', date = todayKey(), slot: slotParam } = useParams();
  const slot = slotFromParam(slotParam);
  const { queries, source, checklistById } = usePlanningData({ from: date, to: date });
  const lookup = useLookups();
  const { can } = useAuth();
  const user = useCurrentUser();

  return (
    <QueryBoundary queries={[...queries, ...lookup.queries]}>
      {() => {
        const occurrence = findOccurrence(source!, scheduleId, date, slot);
        if (!occurrence) {
          return (
            <EmptyState
              title="Routine introuvable"
              description="Cette routine n’est pas planifiée à cette date, ou son occurrence a été annulée."
              action={<Link to="/app/routines">Retour à mes routines</Link>}
            />
          );
        }
        const assigned = isAssignedTo(occurrence.schedule, user);
        if (!assigned && !can('routine.supervise')) return <AccessDenied what="cette routine" />;
        return <RunView occurrence={occurrence} assigned={assigned} checklists={checklistById} lookups={lookup.lookups!} />;
      }}
    </QueryBoundary>
  );
}

interface RunViewProps {
  occurrence: Occurrence;
  assigned: boolean;
  checklists: Map<ID, Checklist>;
  lookups: Lookups;
}

function RunView({ occurrence, assigned, checklists, lookups }: RunViewProps) {
  const user = useCurrentUser();
  const { can } = useAuth();
  const navigate = useNavigate();
  const now = useNow(1000);
  const today = todayKey();
  const { settings } = useSettings();
  const start = useStartRoutine();
  const record = useRecordResult();
  const complete = useCompleteRoutine();
  const addPhoto = useAddRunPhoto();
  const createAnomaly = useCreateAnomaly();
  const [knowledgeId, setKnowledgeId] = useState<string | null>(null);
  const [anomalyFor, setAnomalyFor] = useState<{ task: RoutineTask; item?: ChecklistItem } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { routine, schedule, run, date } = occurrence;
  const state = occurrenceState(occurrence, today, now, settings.routineLateToleranceMinutes);
  const summary = runSummary(routine, checklists, run);
  const editable = assigned && can('routine.execute') && date === today && Boolean(run) && !run?.completedAt;
  const canStart = assigned && can('routine.execute') && date === today && !run;
  const backTo = assigned ? '/app/routines' : '/manager/routines';
  const elapsedMs = run ? (run.completedAt ? new Date(run.completedAt).getTime() : now.getTime()) - new Date(run.startedAt).getTime() : 0;
  const plannedMin = routine.durationMin;
  const overTime = run && !run.completedAt && elapsedMs > plannedMin * 60_000;

  const save = (key: string, result: Omit<ItemResult, 'at' | 'by'> | null) => record.mutateAsync({ run: run!, key, result, user });
  const photosQuery = useCollection('runPhotos', { where: { runId: run?.id ?? '__aucune__' } });
  const photos = new Map((run ? (photosQuery.data ?? []) : []).map((ph) => [ph.id, ph]));

  // Contrôle non conforme avec anomalie automatique : déclarée au nom de la personne qui saisit
  const autoAnomaly = async (task: RoutineTask, item: ChecklistItem, key: string, result: Omit<ItemResult, 'at' | 'by'>) => {
    if (!run || !item.autoAnomaly || result.anomalyId || !can('anomaly.create')) return;
    const value = formatCheckValue(item, { ...result, at: '', by: '' });
    const anomaly = await createAnomaly.mutateAsync({
      input: {
        description: `${routine.title} — ${task.title} : ${item.label}${item.type === 'conformity' ? ' non conforme' : ` (${value})`}${result.comment ? `. ${result.comment}` : ''}`,
        category: categoryOr(item.type === 'number' ? 'quality' : 'standard'),
        severity: item.autoAnomaly,
        workstationId: schedule.workstationId ?? routine.workstationId,
        origin: { type: 'routine', id: run.id },
      },
      reporter: user,
    });
    await save(key, { ...result, anomalyId: anomaly.id });
  };

  const attachPhoto = async (key: string, photo: string) => {
    const current = run?.results[key];
    if (!run || !current) return;
    const created = await addPhoto.mutateAsync({ run, key, photo, user });
    await save(key, {
      status: current.status,
      value: current.value,
      comment: current.comment,
      anomalyId: current.anomalyId,
      photoId: created.id,
    });
  };

  const where = [
    lookups.lineName(schedule.lineId ?? routine.lineId),
    schedule.workstationId || routine.workstationId ? lookups.workstationName(schedule.workstationId ?? routine.workstationId) : null,
  ]
    .filter((v) => v && v !== '—')
    .join(' · ');

  return (
    <>
      <PageHeader
        back={{ to: backTo, label: assigned ? 'Mes routines' : 'Suivi des routines' }}
        title={routine.title}
        description={routine.description}
        meta={
          <>
            <Badge tone={OCCURRENCE_STATE[state].tone}>{OCCURRENCE_STATE[state].label}</Badge>
            <span className={styles.metaText}>
              {formatLongDate(date)} · {schedule.time} · {plannedMin} min prévues
              {where && ` · ${where}`} · {assignmentLabel(schedule, lookups.userName, lookups.teamName)}
            </span>
          </>
        }
      />

      {run && (
        <div className={styles.progressBar} role="region" aria-label="Avancement">
          <Progress value={summary.tasksDone} max={summary.tasks} label="Tâches faites" tone={run.completedAt ? 'success' : 'info'} />
          <span className={styles.progressText}>
            {summary.tasksDone}/{summary.tasks} tâches
            {summary.ko > 0 && (
              <Badge tone="danger">
                {summary.ko} non conforme{summary.ko > 1 ? 's' : ''}
              </Badge>
            )}
          </span>
          <span className={styles.timer} data-over={overTime || undefined} aria-live="off">
            <Clock size={16} aria-hidden />
            <span className="visually-hidden">{run.completedAt ? 'Durée réelle' : 'Temps écoulé'} :</span>
            {formatDuration(elapsedMs)} <span className={styles.timerPlanned}>/ {plannedMin} min</span>
          </span>
        </div>
      )}

      {!run && (
        <Panel
          title={canStart ? 'Prête à démarrer' : date < today ? 'Non réalisée' : 'Pas encore démarrée'}
          description={
            canStart
              ? `${routine.tasks.length} tâche(s) · environ ${estimatedMinutes(routine)} min. Le chronomètre démarre avec la routine.`
              : date < today
                ? 'Cette routine n’a pas été exécutée ce jour-là.'
                : assigned
                  ? date > today
                    ? 'Elle pourra être démarrée le jour prévu.'
                    : 'Vous n’avez pas le droit d’exécuter des routines.'
                  : 'La personne affectée ne l’a pas encore démarrée.'
          }
          actions={
            canStart && (
              <Button
                variant="primary"
                size="lg"
                icon={<Play size={18} aria-hidden />}
                loading={start.isPending}
                onClick={() =>
                  start.mutate({
                    schedule,
                    date,
                    slot: isMultiSlot(schedule) ? occurrence.time : undefined,
                    user,
                  })
                }
              >
                Démarrer
              </Button>
            )
          }
        >
          <ol className={styles.preview}>
            {routine.tasks.map((t) => (
              <li key={t.id}>
                <span>{t.title}</span>
                <span className={styles.previewMeta}>
                  {t.estimatedMin ? `${t.estimatedMin} min` : ''}
                  {!t.required && ' · facultative'}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {run?.completedAt && (
        <Panel accent="success" title="Routine terminée">
          <p className={styles.doneSummary} role="status">
            Terminée à {formatTime(run.completedAt)} par {lookups.userName(run.completedBy ?? run.assigneeId)} · durée réelle{' '}
            <strong>{summary.durationMin} min</strong> (prévue {plannedMin} min) · tâches complétées{' '}
            <strong>
              {summary.tasksDone}/{summary.tasks}
            </strong>
            {summary.ko > 0 && ` · ${summary.ko} non-conformité(s)`}
          </p>
        </Panel>
      )}

      {run && (
        <Stack gap={4}>
          {!editable && !run.completedAt && (
            <p className={styles.readonly} role="note">
              {date !== today
                ? 'Journée passée : consultation uniquement.'
                : `Exécution en cours par ${lookups.userName(run.assigneeId)} — consultation uniquement.`}
            </p>
          )}
          {routine.tasks.map((task, index) => (
            <TaskCard
              key={task.id}
              index={index}
              task={task}
              checks={taskChecks(task, checklists)}
              run={run}
              editable={editable}
              busyKey={record.isPending ? record.variables?.key : undefined}
              userName={lookups.userName}
              onSave={save}
              onOpenKnowledge={setKnowledgeId}
              onDeclare={(item) => setAnomalyFor({ task, item })}
              canDeclare={can('anomaly.create')}
              title={routine.title}
              photos={photos}
              onAutoAnomaly={(item, key, result) => autoAnomaly(task, item, key, result)}
              onAttachPhoto={attachPhoto}
            />
          ))}

          <Panel title="Commentaires sur la routine">
            <CommentThread
              targetType="routineRun"
              targetId={run.id}
              notifyUserIds={[run.assigneeId]}
              title={routine.title}
              link={occurrencePath(occurrence)}
              userName={lookups.userName}
            />
          </Panel>

          {editable && (
            <div className={styles.finish}>
              <p>
                {summary.canComplete
                  ? 'Toutes les tâches obligatoires sont faites.'
                  : `Il reste ${summary.required - summary.requiredDone} tâche(s) obligatoire(s) à faire avant de terminer.`}
              </p>
              <Button
                variant="primary"
                size="lg"
                icon={<CheckCircle2 size={18} aria-hidden />}
                disabled={!summary.canComplete}
                onClick={() => setConfirmOpen(true)}
              >
                Terminer la routine
              </Button>
            </div>
          )}
        </Stack>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Routine terminée"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Revenir aux tâches</Button>
            <Button
              variant="primary"
              loading={complete.isPending}
              onClick={async () => {
                await complete.mutateAsync({ run: run!, routine, checklists, user });
                setConfirmOpen(false);
                navigate('/app', { replace: false });
              }}
            >
              Terminer
            </Button>
          </>
        }
      >
        <dl className={styles.recap}>
          <div>
            <dt>Durée réelle</dt>
            <dd>{Math.max(1, Math.round(elapsedMs / 60_000))} min</dd>
          </div>
          <div>
            <dt>Tâches complétées</dt>
            <dd>
              {summary.tasksDone}/{summary.tasks}
            </dd>
          </div>
          <div>
            <dt>Non-conformités</dt>
            <dd>{summary.ko}</dd>
          </div>
        </dl>
      </Modal>

      <KnowledgeQuickView knowledgeId={knowledgeId} onClose={() => setKnowledgeId(null)} />

      <Modal
        open={anomalyFor !== null}
        onClose={() => setAnomalyFor(null)}
        title="Déclarer une anomalie"
        description="Le contrôle est enregistré comme non conforme. Déclarez une anomalie pour en assurer le suivi."
        size="md"
      >
        {anomalyFor && run && (
          <AnomalyForm
            workstations={lookups.workstations}
            origin={{ type: 'routine', id: run.id }}
            initial={{
              description: `${routine.title} — ${anomalyFor.task.title}${anomalyFor.item ? ` : ${anomalyFor.item.label}` : ''}`,
              category: categoryOr('standard'),
              workstationId: schedule.workstationId ?? routine.workstationId,
            }}
            onCancel={() => setAnomalyFor(null)}
            onCreated={async (anomaly) => {
              const key = anomalyFor.item ? checkKey(anomalyFor.task.id, anomalyFor.item.id) : anomalyFor.task.id;
              const current = run.results[key];
              if (current)
                await save(key, { status: current.status, value: current.value, comment: current.comment, anomalyId: anomaly.id });
              setAnomalyFor(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}

interface TaskCardProps {
  index: number;
  task: RoutineTask;
  checks: ChecklistItem[];
  run: RoutineRun;
  editable: boolean;
  busyKey?: string;
  userName: (id?: string) => string;
  onSave: (key: string, result: Omit<ItemResult, 'at' | 'by'> | null) => Promise<unknown>;
  onOpenKnowledge: (id: string) => void;
  onDeclare: (item?: ChecklistItem) => void;
  canDeclare: boolean;
  title: string;
  photos: Map<ID, RunPhoto>;
  onAutoAnomaly: (item: ChecklistItem, key: string, result: Omit<ItemResult, 'at' | 'by'>) => Promise<void>;
  onAttachPhoto: (key: string, photo: string) => Promise<void>;
}

function TaskCard({
  index,
  task,
  checks,
  run,
  editable,
  busyKey,
  userName,
  onSave,
  onOpenKnowledge,
  onDeclare,
  canDeclare,
  title,
  photos,
  onAutoAnomaly,
  onAttachPhoto,
}: TaskCardProps) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const progress = taskProgress(task, checks, run);
  const taskResult = run.results[task.id];

  // La photo et le commentaire déjà saisis sont conservés quand la valeur change
  const saveCheck = async (item: ChecklistItem, key: string, status: CheckResult, value?: CheckValue) => {
    const prev = run.results[key];
    const result = {
      status,
      value,
      comment: prev?.comment,
      photoId: prev?.photoId,
      anomalyId: status === 'ko' ? prev?.anomalyId : undefined,
    };
    await onSave(key, result);
    if (status === 'ko') await onAutoAnomaly(item, key, result);
  };

  return (
    <Panel
      className={styles.task}
      title={
        <span className={styles.taskTitle}>
          <span className={styles.taskIndex}>{index + 1}</span>
          {task.title}
        </span>
      }
      description={[
        task.estimatedMin ? `${task.estimatedMin} min` : null,
        task.required ? 'Obligatoire' : 'Facultative',
        task.responsibleRole ? `Responsable : ${ROLE_LABELS[task.responsibleRole]}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      actions={
        <span className={styles.taskActions}>
          {(task.priority === 'high' || task.priority === 'critical') && (
            <Badge tone={PRIORITY[task.priority].tone}>Priorité {PRIORITY[task.priority].label.toLowerCase()}</Badge>
          )}
          <Badge tone={TASK_STATE[progress.state].tone}>{TASK_STATE[progress.state].label}</Badge>
        </span>
      }
    >
      {(task.instructions || task.description) && (
        <div className={styles.instructions}>
          {task.description && <p>{task.description}</p>}
          {task.instructions && (
            <p>
              <strong>Consigne : </strong>
              {task.instructions}
            </p>
          )}
        </div>
      )}

      {checks.length === 0 ? (
        <div className={styles.check} data-status={taskResult?.status ?? 'none'}>
          <div className={styles.checkText}>
            <span className={styles.checkLabel}>Résultat de la tâche</span>
            {taskResult && (
              <span className={styles.checkMeta}>
                {userName(taskResult.by)} · {formatTime(taskResult.at)}
              </span>
            )}
          </div>
          <CheckResultToggle
            itemLabel={task.title}
            value={taskResult?.status}
            disabled={!editable || busyKey === task.id}
            onChange={(status) => void onSave(task.id, { status, anomalyId: taskResult?.anomalyId })}
          />
          <ResultFollowUp
            result={taskResult}
            editable={editable}
            canDeclare={canDeclare}
            onDeclare={() => onDeclare()}
            onUndo={() => void onSave(task.id, null)}
          />
        </div>
      ) : (
        <ul className={styles.checks}>
          {checks.map((item) => {
            const key = checkKey(task.id, item.id);
            const result = run.results[key];
            return (
              <li key={item.id} className={styles.check} data-status={result?.status ?? 'none'}>
                <div className={styles.checkText}>
                  <span className={styles.checkLabel}>
                    {item.label}
                    {item.required && (
                      <span className={styles.required} aria-label="obligatoire">
                        {' '}
                        *
                      </span>
                    )}
                  </span>
                  {result && (
                    <span className={styles.checkMeta}>
                      {item.type !== 'conformity' && (
                        <>
                          <strong>{formatCheckValue(item, result)}</strong>
                          {item.type === 'number' && result.status === 'ko' && ' — hors tolérance'}
                          {' · '}
                        </>
                      )}
                      {userName(result.by)} · {formatTime(result.at)}
                    </span>
                  )}
                </div>
                <div className={styles.checkControl}>
                  {item.knowledgeId && (
                    <IconButton
                      label="Voir le standard associé"
                      icon={<BookOpen size={18} />}
                      onClick={() => onOpenKnowledge(item.knowledgeId!)}
                    />
                  )}
                  <CheckInput
                    key={`${key}-${result?.at ?? 'vide'}`}
                    item={item}
                    result={result}
                    disabled={!editable || busyKey === key}
                    onSave={(status, value) => void saveCheck(item, key, status, value)}
                  />
                </div>
                <ResultFollowUp
                  result={result}
                  editable={editable}
                  canDeclare={canDeclare}
                  onDeclare={() => onDeclare(item)}
                  onUndo={() => void onSave(key, null)}
                />
                <CheckExtras
                  item={item}
                  result={result}
                  photo={result?.photoId ? photos.get(result.photoId) : undefined}
                  editable={editable}
                  onPhoto={(photo) => onAttachPhoto(key, photo)}
                  onComment={(comment) => (result ? onSave(key, { ...result, comment }) : Promise.resolve())}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className={styles.taskFooter}>
        {task.knowledgeId && (
          <Button size="sm" variant="ghost" icon={<BookOpen size={15} aria-hidden />} onClick={() => onOpenKnowledge(task.knowledgeId!)}>
            Standard associé
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          icon={<MessageSquare size={15} aria-hidden />}
          aria-expanded={commentsOpen}
          onClick={() => setCommentsOpen((o) => !o)}
        >
          Commentaires de la tâche
        </Button>
      </div>
      {commentsOpen && (
        <div className={styles.taskComments}>
          <CommentThread
            targetType="routineRun"
            targetId={run.id}
            anchorId={task.id}
            label={`Commenter « ${task.title} »`}
            notifyUserIds={[run.assigneeId]}
            title={`${title} — ${task.title}`}
            link={`/app/routines/${run.scheduleId}/${run.date}${run.slot ? `/${run.slot.replace(':', '')}` : ''}`}
            userName={userName}
          />
        </div>
      )}
    </Panel>
  );
}

function ResultFollowUp({
  result,
  editable,
  canDeclare,
  onDeclare,
  onUndo,
}: {
  result?: ItemResult;
  editable: boolean;
  canDeclare: boolean;
  onDeclare: () => void;
  onUndo: () => void;
}) {
  if (!result) return null;
  return (
    <div className={styles.followUp}>
      {result.anomalyId ? (
        <Link to={`/anomalies/${result.anomalyId}`} className={styles.anomalyLink}>
          <TriangleAlert size={14} aria-hidden /> Anomalie liée
        </Link>
      ) : (
        editable &&
        canDeclare &&
        result.status === 'ko' && (
          <Button size="sm" variant="secondary" icon={<TriangleAlert size={15} aria-hidden />} onClick={onDeclare}>
            Déclarer une anomalie
          </Button>
        )
      )}
      {editable && (
        <button type="button" className={styles.undo} onClick={onUndo}>
          <RotateCcw size={12} aria-hidden /> Annuler la saisie
        </button>
      )}
    </div>
  );
}

/** Compléments d'un contrôle saisi : photo, commentaire sur non-conformité, ce qui manque encore. */
function CheckExtras({
  item,
  result,
  photo,
  editable,
  onPhoto,
  onComment,
}: {
  item: ChecklistItem;
  result?: ItemResult;
  photo?: RunPhoto;
  editable: boolean;
  onPhoto: (photo: string) => Promise<void>;
  onComment: (comment: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(result?.comment ?? '');
  if (!result) return null;
  const missing = checkMissing(item, result);
  const askComment = result.status === 'ko' && (item.commentOnFail || Boolean(result.comment));
  if (!item.photo && !askComment && !missing) return null;
  return (
    <div className={styles.extras}>
      {item.photo &&
        (photo ? (
          <img className={styles.checkPhoto} src={photo.photo} alt={`Photo du contrôle « ${item.label} »`} />
        ) : (
          editable && (
            <PhotoInput
              label={item.photo === 'required' ? 'Photo obligatoire' : 'Photo (facultative)'}
              onChange={(dataUrl) => dataUrl && void onPhoto(dataUrl)}
            />
          )
        ))}
      {askComment && (
        <form
          className={styles.extraComment}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) void onComment(draft.trim());
          }}
        >
          <TextAreaField
            label={item.commentOnFail ? 'Commentaire (obligatoire) : constat et action immédiate' : 'Commentaire'}
            rows={2}
            value={draft}
            disabled={!editable}
            onChange={(e) => setDraft(e.target.value)}
          />
          {editable && (
            <Button type="submit" size="sm" disabled={!draft.trim() || draft.trim() === (result.comment ?? '')}>
              Enregistrer le commentaire
            </Button>
          )}
        </form>
      )}
      {missing && (
        <p className={styles.missing} role="status">
          <TriangleAlert size={14} aria-hidden /> {missing}
        </p>
      )}
    </div>
  );
}
