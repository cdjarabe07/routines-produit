import { useState } from 'react';
import { useParams } from 'react-router';
import { BookOpen, Check, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { Checkbox } from '@/components/ui/Field';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Panel } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/Progress';
import { KnowledgeQuickView } from '@/features/knowledge/components/KnowledgeQuickView';
import { useLookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useNow } from '@/hooks/useNow';
import type { SequenceRun, SequenceTemplate } from '@/types/domain';
import { formatDateTime, formatDuration } from '@/utils/date';
import { cx } from '@/utils/cx';
import { useSequenceTransition, type Transition } from '../api';
import { RUN_STATUS, isLive, plannedMs, runSteps, stepElapsedMs, totalElapsedMs } from '../model';
import styles from './SequenceRunPage.module.css';

export function SequenceRunPage() {
  const { runId } = useParams();
  const runs = useCollection('sequenceRuns');
  const templates = useCollection('sequenceTemplates');
  const { queries, lookups } = useLookups();
  return (
    <QueryBoundary queries={[runs, templates, ...queries]}>
      {() => {
        const run = runs.data!.find((r) => r.id === runId);
        const template = run && templates.data!.find((t) => t.id === run.templateId);
        if (!run || !template)
          return <EmptyState title="Exécution introuvable" action={<ButtonLink to="/app/sequences">Retour aux séquences</ButtonLink>} />;
        return <RunScreen run={run} template={template} starterName={lookups!.userName(run.startedBy)} />;
      }}
    </QueryBoundary>
  );
}

function RunScreen({ run, template, starterName }: { run: SequenceRun; template: SequenceTemplate; starterName: string }) {
  const now = useNow(500);
  const transition = useSequenceTransition();
  const confirm = useConfirm();
  const [knowledgeId, setKnowledgeId] = useState<string | null>(null);
  const [validated, setValidated] = useState<string | null>(null);
  const live = isLive(run);
  const steps = runSteps(template, run);
  const index = run.currentStepIndex;
  const step = steps[index];
  const needsValidation = Boolean(step?.validation) && validated !== step?.id;
  const elapsed = stepElapsedMs(run, index, now);
  const target = (step?.durationMin ?? 0) * 60_000;
  const over = elapsed - target;
  const act = (t: Transition) => transition.mutate({ run, transition: t });
  const last = index === steps.length - 1;

  return (
    <>
      <PageHeader
        back={{ to: '/app/sequences', label: 'Séquences guidées' }}
        title={template.name}
        meta={
          <>
            <Badge tone={RUN_STATUS[run.status].tone}>{RUN_STATUS[run.status].label}</Badge>
            <span className={styles.meta}>
              Démarrée par {starterName} · {formatDateTime(run.createdAt)}
            </span>
          </>
        }
        actions={
          live && (
            <Button
              variant="ghost"
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Abandonner la séquence ?',
                    message: 'Les temps déjà enregistrés sont conservés dans l’historique.',
                    confirmLabel: 'Abandonner',
                    tone: 'danger',
                  })
                )
                  act('abort');
              }}
            >
              Abandonner
            </Button>
          )
        }
      />

      <div className={styles.layout}>
        {live && step ? (
          <section className={styles.focus} aria-labelledby="current-step">
            <p className={styles.stepCount}>
              Étape {index + 1} sur {steps.length}
              {step.plannedTime ? ` · prévue à ${step.plannedTime}` : ''}
            </p>
            <h2 id="current-step" className={styles.stepTitle}>
              {step.title}
            </h2>
            {step.instruction && <p className={styles.instruction}>{step.instruction}</p>}
            {step.knowledgeId && (
              <Button size="sm" variant="ghost" icon={<BookOpen size={16} aria-hidden />} onClick={() => setKnowledgeId(step.knowledgeId!)}>
                Voir le standard
              </Button>
            )}
            {step.validation && (
              <div className={styles.validation}>
                <Checkbox
                  label={`Validé : ${step.validation}`}
                  description="À confirmer avant de passer à l’étape suivante."
                  checked={validated === step.id}
                  onChange={(e) => setValidated(e.target.checked ? step.id : null)}
                />
              </div>
            )}

            <div
              className={cx(styles.timer, over > 0 && styles.over, run.status === 'paused' && styles.paused)}
              role="timer"
              aria-live="off"
            >
              <span className={styles.time}>{formatDuration(elapsed)}</span>
              <span className={styles.target}>
                {run.status === 'paused' ? 'En pause · ' : ''}
                cible {formatDuration(target)}
                {over > 0 && <strong> · dépassement +{formatDuration(over)}</strong>}
              </span>
            </div>
            <Progress
              value={Math.min(elapsed, target)}
              max={target || 1}
              label="Temps écoulé sur la durée cible"
              tone={over > 0 ? 'warning' : 'info'}
            />

            <div className={styles.controls}>
              <Button
                size="lg"
                icon={<ChevronLeft size={20} aria-hidden />}
                disabled={index === 0 || transition.isPending}
                onClick={() => act('previous')}
              >
                Précédente
              </Button>
              {run.status === 'running' ? (
                <Button size="lg" icon={<Pause size={20} aria-hidden />} disabled={transition.isPending} onClick={() => act('pause')}>
                  Pause
                </Button>
              ) : (
                <Button size="lg" icon={<Play size={20} aria-hidden />} disabled={transition.isPending} onClick={() => act('resume')}>
                  Reprendre
                </Button>
              )}
              <Button
                size="lg"
                variant={last ? 'success' : 'primary'}
                iconRight={last ? <Check size={20} aria-hidden /> : <ChevronRight size={20} aria-hidden />}
                disabled={transition.isPending || needsValidation}
                title={needsValidation ? 'Confirmez d’abord le critère de validation' : undefined}
                onClick={() => {
                  setValidated(null);
                  act('next');
                }}
              >
                {last ? 'Terminer' : 'Étape suivante'}
              </Button>
            </div>
          </section>
        ) : (
          <Panel
            title={run.status === 'completed' ? 'Séquence terminée' : 'Séquence abandonnée'}
            accent={run.status === 'completed' ? 'success' : undefined}
          >
            <p className={styles.summary}>
              Durée réelle <strong>{formatDuration(totalElapsedMs(run, now))}</strong> pour une durée cible de{' '}
              <strong>{formatDuration(plannedMs(template))}</strong>.
            </p>
          </Panel>
        )}

        <Panel title="Étapes" flush>
          <ol className={styles.steps}>
            {steps.map((s, i) => {
              const log = run.steps[i];
              const spent = stepElapsedMs(run, i, now);
              const state = log?.completedAt ? 'done' : live && i === index ? 'current' : 'todo';
              const overStep = spent > s.durationMin * 60_000;
              return (
                <li key={s.id} className={cx(styles.stepRow, styles[state])} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className={styles.stepIndex}>{state === 'done' ? <Check size={14} aria-label="Terminée" /> : i + 1}</span>
                  <span className={styles.stepName}>{s.title}</span>
                  <span className={cx(styles.stepTime, overStep && styles.stepOver)}>
                    {spent > 0 ? formatDuration(spent) : '—'} / {s.durationMin} min
                  </span>
                </li>
              );
            })}
          </ol>
        </Panel>
      </div>

      <KnowledgeQuickView knowledgeId={knowledgeId} onClose={() => setKnowledgeId(null)} />
    </>
  );
}
