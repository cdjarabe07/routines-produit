import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { EmptyState, QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button, ButtonLink, IconButton } from '@/components/ui/Button';
import { Checkbox, FormGrid, SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Panel';
import { PhotoInput } from '@/components/ui/PhotoInput';
import { defaultDueDate } from '@/features/actions/model';
import { CheckResultToggle } from '@/features/shared/components/CheckResultToggle';
import { SEVERITY, options } from '@/features/shared/labels';
import { useLookups, userOptions, workstationOptions, type Lookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import type { GembaObservation, GembaWalk, Severity } from '@/types/domain';
import { formatLongDate, todayKey } from '@/utils/date';
import { createId } from '@/utils/id';
import { cx } from '@/utils/cx';
import { useSaveGembaDraft, useValidateGemba, type GembaDraft, type PlannedAction } from '../api';
import { koItems, newChecklist, suggestsAction, validationErrors } from '../model';
import styles from './GembaFormPage.module.css';

const STEPS = ['Informations', 'Checklist', 'Observations', 'Résumé'];

export function GembaFormPage() {
  const [params] = useSearchParams();
  const draftId = params.get('brouillon') ?? undefined;
  const walks = useCollection('gembaWalks');
  const { queries, lookups } = useLookups();
  return (
    <QueryBoundary queries={[walks, ...queries]}>
      {() => {
        const existing = draftId ? walks.data!.find((w) => w.id === draftId) : undefined;
        if (draftId && (!existing || existing.status !== 'draft')) {
          return <EmptyState title="Brouillon introuvable" description="Il a peut-être déjà été validé." action={<ButtonLink to="/gemba">Retour aux Gemba Walk</ButtonLink>} />;
        }
        return <Wizard existing={existing} lookups={lookups!} />;
      }}
    </QueryBoundary>
  );
}

function Wizard({ existing, lookups }: { existing?: GembaWalk; lookups: Lookups }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const saveDraft = useSaveGembaDraft();
  const validate = useValidateGemba();
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState(existing?.id);
  const [walk, setWalk] = useState<GembaDraft>(() =>
    existing
      ? { date: existing.date, zone: existing.zone, leaderId: existing.leaderId, participantIds: existing.participantIds, checklist: existing.checklist, observations: existing.observations }
      : { date: todayKey(), zone: '', leaderId: user.id, participantIds: [], checklist: newChecklist(), observations: [] },
  );
  const [planned, setPlanned] = useState<Record<string, PlannedAction | null>>({});
  const errors = useMemo(() => validationErrors(walk), [walk]);

  const patch = (p: Partial<GembaDraft>) => setWalk((w) => ({ ...w, ...p }));
  const setObservation = (id: string, p: Partial<GembaObservation>) => patch({ observations: walk.observations.map((o) => (o.id === id ? { ...o, ...p } : o)) });

  const plannedFor = (o: GembaObservation): PlannedAction | null =>
    o.id in planned ? planned[o.id]! : suggestsAction(o) ? { observationId: o.id, assigneeId: '', dueDate: defaultDueDate(o.severity, walk.date) } : null;

  const doSaveDraft = async () => {
    const saved = await saveDraft.mutateAsync({ id: draftId, draft: walk });
    setDraftId(saved.id);
  };

  const doValidate = async () => {
    const plans = walk.observations.map(plannedFor).filter((p): p is PlannedAction => p !== null);
    const missing = plans.filter((p) => !p.assigneeId);
    if (missing.length) return;
    const saved = await validate.mutateAsync({ id: draftId, draft: walk, planned: plans, user });
    navigate(`/gemba/${saved.id}`);
  };

  const plansMissingAssignee = walk.observations.map(plannedFor).filter((p) => p && !p.assigneeId).length;

  return (
    <>
      <PageHeader back={{ to: '/gemba', label: 'Gemba Walk' }} title={existing ? 'Reprendre la Gemba Walk' : 'Nouvelle Gemba Walk'} description="Observer le terrain, relever les écarts, proposer des améliorations." />
      <ol className={styles.stepper} aria-label="Étapes">
        {STEPS.map((label, i) => (
          <li key={label} className={cx(styles.stepItem, i === step && styles.stepCurrent, i < step && styles.stepDone)} aria-current={i === step ? 'step' : undefined}>
            <button type="button" onClick={() => setStep(i)} className={styles.stepButton}>
              <span className={styles.stepNumber}>{i + 1}</span>
              <span className={styles.stepLabel}>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      <Stack>
        {step === 0 && (
          <Panel title="Informations">
            <FormGrid>
              <TextField label="Date" type="date" max={todayKey()} value={walk.date} onChange={(e) => patch({ date: e.target.value })} />
              <TextField label="Zone observée" required value={walk.zone} onChange={(e) => patch({ zone: e.target.value })} placeholder="Ex. : Ligne A — Poste 4 (Rubanage)" />
              <fieldset className={cx('full', styles.participants)}>
                <legend>Participants</legend>
                <div className={styles.participantGrid}>
                  {lookups.activeUsers.filter((u) => u.id !== walk.leaderId && u.role !== 'admin').map((u) => (
                    <Checkbox
                      key={u.id}
                      label={u.name}
                      checked={walk.participantIds.includes(u.id)}
                      onChange={(e) => patch({ participantIds: e.target.checked ? [...walk.participantIds, u.id] : walk.participantIds.filter((id) => id !== u.id) })}
                    />
                  ))}
                </div>
              </fieldset>
            </FormGrid>
          </Panel>
        )}

        {step === 1 && (
          <Panel title="Checklist de la marche" description="Commentaire obligatoire pour chaque point non conforme." flush>
            <ul className={styles.checklist}>
              {walk.checklist.map((c, i) => (
                <li key={c.id} className={styles.checkItem} data-status={c.result ?? 'none'}>
                  <div className={styles.checkRow}>
                    <span className={styles.checkLabel}>{i + 1}. {c.label}</span>
                    <CheckResultToggle itemLabel={c.label} value={c.result} onChange={(result) => patch({ checklist: walk.checklist.map((x) => (x.id === c.id ? { ...x, result } : x)) })} />
                  </div>
                  {c.result && (
                    <TextField
                      label={c.result === 'ko' ? 'Constat (obligatoire)' : 'Commentaire'}
                      hideLabel={c.result !== 'ko'}
                      placeholder={c.result === 'ko' ? 'Ce qui n’est pas conforme' : 'Commentaire (facultatif)'}
                      value={c.comment ?? ''}
                      onChange={(e) => patch({ checklist: walk.checklist.map((x) => (x.id === c.id ? { ...x, comment: e.target.value } : x)) })}
                      error={c.result === 'ko' && !c.comment?.trim() ? 'Décrivez le constat' : undefined}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {step === 2 && (
          <Stack gap={4}>
            {walk.observations.length === 0 && <EmptyState compact title="Aucune observation pour l’instant." description="Ajoutez les constats et les améliorations que vous proposez." />}
            {walk.observations.map((o, i) => (
              <Panel
                key={o.id}
                title={`Observation ${i + 1}`}
                actions={<IconButton label={`Supprimer l’observation ${i + 1}`} variant="danger" size="sm" icon={<Trash2 size={15} />} onClick={() => patch({ observations: walk.observations.filter((x) => x.id !== o.id) })} />}
              >
                <FormGrid>
                  <TextAreaField className="full" label="Constat" required rows={2} value={o.finding} onChange={(e) => setObservation(o.id, { finding: e.target.value })} placeholder="Ce qui ne fonctionne pas : gaspillage, risque, écart au standard…" />
                  <TextAreaField className="full" label="Amélioration proposée" rows={2} value={o.improvement} onChange={(e) => setObservation(o.id, { improvement: e.target.value })} />
                  <SelectField label="Gravité" options={options(SEVERITY)} value={o.severity} onChange={(e) => setObservation(o.id, { severity: e.target.value as Severity })} />
                  <SelectField label="Poste" placeholder="Non précisé" options={workstationOptions(lookups.workstations)} value={o.workstationId ?? ''} onChange={(e) => setObservation(o.id, { workstationId: e.target.value || undefined })} />
                  <div className="full"><PhotoInput value={o.photo} onChange={(photo) => setObservation(o.id, { photo })} /></div>
                </FormGrid>
              </Panel>
            ))}
            <div>
              <Button icon={<Plus size={16} aria-hidden />} onClick={() => patch({ observations: [...walk.observations, { id: createId(), finding: '', improvement: '', severity: 'major' }] })}>
                Ajouter une observation
              </Button>
            </div>
          </Stack>
        )}

        {step === 3 && (
          <Stack gap={4}>
            <Panel title="Résumé">
              <dl className={styles.summary}>
                <div><dt>Date</dt><dd>{formatLongDate(walk.date)}</dd></div>
                <div><dt>Zone</dt><dd>{walk.zone || '—'}</dd></div>
                <div><dt>Conduite par</dt><dd>{lookups.userName(walk.leaderId)}{walk.participantIds.length ? ` avec ${walk.participantIds.map(lookups.userName).join(', ')}` : ''}</dd></div>
                <div>
                  <dt>Checklist</dt>
                  <dd>
                    {walk.checklist.filter((c) => c.result === 'ok').length} conforme(s) · {koItems(walk).length} non conforme(s) · {walk.checklist.filter((c) => c.result === 'na').length} N.A. · {walk.checklist.filter((c) => !c.result).length} non renseigné(s)
                  </dd>
                </div>
              </dl>
              {koItems(walk).length > 0 && (
                <ul className={styles.koList}>
                  {koItems(walk).map((c) => <li key={c.id}><strong>{c.label}</strong> — {c.comment || 'sans commentaire'}</li>)}
                </ul>
              )}
            </Panel>

            <Panel title="Actions correctives" description="Proposées pour les observations majeures et critiques. Échéance selon la gravité (critique 1 j, majeure 3 j, mineure 7 j)." flush>
              {walk.observations.length === 0 ? (
                <EmptyState compact title="Aucune observation : aucune action à créer." />
              ) : (
                <ul className={styles.plans}>
                  {walk.observations.map((o) => {
                    const plan = plannedFor(o);
                    return (
                      <li key={o.id} className={styles.plan}>
                        <div className={styles.planHead}>
                          <Badge tone={SEVERITY[o.severity].tone}>{SEVERITY[o.severity].label}</Badge>
                          <span>{o.finding || <em>Constat manquant</em>}</span>
                        </div>
                        <Checkbox
                          label="Créer une action corrective"
                          checked={plan !== null}
                          onChange={(e) => setPlanned((p) => ({ ...p, [o.id]: e.target.checked ? { observationId: o.id, assigneeId: '', dueDate: defaultDueDate(o.severity, walk.date) } : null }))}
                        />
                        {plan && (
                          <FormGrid>
                            <SelectField label="Responsable" required placeholder="Choisir…" options={userOptions(lookups.activeUsers)} value={plan.assigneeId} onChange={(e) => setPlanned((p) => ({ ...p, [o.id]: { ...plan, assigneeId: e.target.value } }))} error={!plan.assigneeId ? 'Choisissez un responsable' : undefined} />
                            <TextField label="Échéance" type="date" value={plan.dueDate} onChange={(e) => setPlanned((p) => ({ ...p, [o.id]: { ...plan, dueDate: e.target.value } }))} />
                          </FormGrid>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            {errors.length > 0 && (
              <div className={styles.errors} role="alert">
                <strong>Avant de valider :</strong>
                <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
          </Stack>
        )}

        <div className={styles.nav}>
          <Button disabled={step === 0} onClick={() => setStep(step - 1)}>Précédent</Button>
          <Button variant="ghost" loading={saveDraft.isPending} onClick={doSaveDraft}>Enregistrer le brouillon</Button>
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>Suivant</Button>
          ) : (
            <Button variant="primary" loading={validate.isPending} disabled={errors.length > 0 || plansMissingAssignee > 0} onClick={doValidate}>
              Valider la marche
            </Button>
          )}
        </div>
      </Stack>
    </>
  );
}
