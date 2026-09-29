import { useOperation } from '@/hooks/useData';
import { createAnomaly } from '@/features/anomalies/api';
import { notify } from '@/features/notifications/api';
import { roleCan } from '@/services/auth/permissions';
import { ValidationError } from '@/services/errors';
import type { DataSource } from '@/services/data/types';
import type { AndonAlert, AndonType, AndonUrgency, ID, User } from '@/types/domain';
import { ANDON_TYPE } from './model';

export interface RaiseInput {
  workstationId: ID;
  type: AndonType;
  urgency: AndonUrgency;
  detail: string;
}

async function raise(ds: DataSource, input: RaiseInput, user: User): Promise<AndonAlert> {
  const existing = (await ds.repo('andonAlerts').list({ where: { workstationId: input.workstationId } })).find(
    (a) => a.status !== 'resolved' && a.type === input.type,
  );
  if (existing) throw new ValidationError(`Un Andon ${ANDON_TYPE[input.type].label.toLowerCase()} est déjà en cours sur ce poste.`);

  const now = new Date().toISOString();
  const alert = await ds.repo('andonAlerts').create({ ...input, detail: input.detail.trim(), status: 'active', raisedBy: user.id, raisedAt: now });

  // Prévenir les personnes habilitées à intervenir sur la ligne du poste
  const ws = await ds.repo('workstations').get(input.workstationId);
  const responders = (await ds.repo('users').list()).filter(
    (u) => u.active && roleCan(u.role, 'andon.respond') && u.role !== 'admin' && (!u.lineId || u.lineId === ws.lineId),
  );
  await notify(ds, responders.map((u) => u.id), { kind: 'andon_raised', title: `Andon ${ANDON_TYPE[input.type].label.toLowerCase()} — ${ws.name}`, link: '/andon' }, user.id);
  return alert;
}

export function useRaiseAndon() {
  return useOperation((ds, { input, user }: { input: RaiseInput; user: User }) => raise(ds, input, user), {
    invalidates: ['andonAlerts', 'notifications'],
    success: 'Andon déclenché. Les intervenants de la ligne sont prévenus.',
  });
}

export function useAcknowledgeAndon() {
  return useOperation(
    async (ds, { alert, user }: { alert: AndonAlert; user: User }) => {
      const fresh = await ds.repo('andonAlerts').get(alert.id);
      if (fresh.status !== 'active') throw new ValidationError('Cet Andon a déjà été pris en charge.');
      return ds.repo('andonAlerts').update(alert.id, { status: 'acknowledged', acknowledgedBy: user.id, acknowledgedAt: new Date().toISOString() });
    },
    { invalidates: ['andonAlerts'], success: 'Prise en charge enregistrée.' },
  );
}

export interface ResolveInput {
  alert: AndonAlert;
  user: User;
  rootCause: string;
  resolution: string;
  createFollowUp: boolean;
}

export function useResolveAndon() {
  return useOperation(
    async (ds, { alert, user, rootCause, resolution, createFollowUp }: ResolveInput) => {
      const now = new Date().toISOString();
      const resolved = await ds.repo('andonAlerts').update(alert.id, {
        status: 'resolved',
        acknowledgedBy: alert.acknowledgedBy ?? user.id,
        acknowledgedAt: alert.acknowledgedAt ?? now,
        resolvedBy: user.id,
        resolvedAt: now,
        rootCause: rootCause.trim(),
        resolution: resolution.trim(),
      });
      if (createFollowUp) {
        await createAnomaly(
          ds,
          {
            description: `Suite Andon « ${alert.detail} » — cause : ${rootCause.trim()}`,
            category: alert.type === 'safety' ? 'safety' : alert.type === 'material' ? 'material' : alert.type === 'equipment' ? 'equipment' : 'quality',
            severity: alert.urgency === 'critical' ? 'critical' : 'major',
            workstationId: alert.workstationId,
            origin: { type: 'andon', id: alert.id },
          },
          user,
        );
      }
      return resolved;
    },
    { invalidates: ['andonAlerts', 'anomalies', 'notifications'], success: 'Andon résolu.' },
  );
}
