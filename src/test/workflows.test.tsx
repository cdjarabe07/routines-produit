import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { FIXED_NOW, renderApp } from './renderApp';

/* Parcours critiques de bout en bout, sur l'application réelle (routes, écrans, règles, données). */

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(FIXED_NOW);
});
afterAll(() => vi.useRealTimers());

const TIMEOUT = { timeout: 4000 };

describe('connexion et droits', () => {
  it('connexion DÉMO par choix de profil, puis accueil personnalisé', async () => {
    const { user } = renderApp('/');
    expect(await screen.findByText(/Mode démonstration\./, {}, TIMEOUT)).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /Karim Benali/ }));
    expect(await screen.findByRole('heading', { level: 1, name: /Bonjour Karim/ }, TIMEOUT)).toBeInTheDocument();
    expect(screen.getByText(/MODE DÉMO/)).toBeInTheDocument();
  });

  it('un opérateur ne voit pas le reporting et reçoit un refus explicite', async () => {
    renderApp('/reporting', { userId: 'u-nadia' });
    expect(await screen.findByText('Accès non autorisé', {}, TIMEOUT)).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!;
    expect(within(nav).queryByRole('link', { name: /Reporting/ })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Andon/ })).toBeInTheDocument();
  });

  it('page inconnue : message et retour à l’accueil', async () => {
    renderApp('/nimporte-quoi', { userId: 'u-karim' });
    expect(await screen.findByText('Page introuvable', {}, TIMEOUT)).toBeInTheDocument();
  });
});

describe('routines', () => {
  it('valider un point met à jour l’avancement ; un point non conforme propose une anomalie', async () => {
    const { user, ds } = renderApp('/routines/rt-ll-audit/2026-09-29', { userId: 'u-karim' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Audit terrain' }, TIMEOUT)).toBeInTheDocument();

    const first = screen.getByRole('group', { name: 'Résultat : EPI conformes sur la ligne' });
    await user.click(within(first).getByRole('button', { name: 'Conforme' }));
    await waitFor(() => expect(screen.getByText('1/28 points')).toBeInTheDocument());

    const second = screen.getByRole('group', { name: 'Résultat : Zones de circulation dégagées' });
    await user.click(within(second).getByRole('button', { name: 'Non conforme' }));
    const dialog = await screen.findByRole('dialog', { name: 'Déclarer une anomalie ?' }, TIMEOUT);
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer l’anomalie' }));

    await waitFor(async () => {
      const anomalies = await ds.repo('anomalies').list();
      expect(anomalies.some((a) => a.origin.type === 'routine' && a.description.includes('Zones de circulation'))).toBe(true);
    }, TIMEOUT);
    expect(await screen.findByRole('link', { name: /Anomalie liée/ }, TIMEOUT)).toBeInTheDocument();
  });

  it('une journée passée est en consultation seule', async () => {
    renderApp('/routines/rt-ll-open/2026-09-28', { userId: 'u-karim' });
    expect(await screen.findByText('Journée passée : consultation uniquement.', {}, TIMEOUT)).toBeInTheDocument();
    const group = screen.getAllByRole('group')[0]!;
    expect(within(group).getByRole('button', { name: 'Conforme' })).toBeDisabled();
  });
});

describe('anomalies', () => {
  it('déclaration depuis un QR code : poste pré-rempli, validation, enregistrement', async () => {
    const { user, ds } = renderApp('/signaler?poste=P4', { userId: 'u-nadia' });
    expect(await screen.findByText(/Poste identifié par QR code/, {}, TIMEOUT)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enregistrer l’anomalie' }));
    expect(await screen.findByText('Décrivez le problème constaté')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Description du problème/), 'Ruban mal enroulé sur trois faisceaux');
    await user.selectOptions(screen.getByLabelText(/Catégorie/), 'quality');
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’anomalie' }));

    expect(await screen.findByText('Anomalie enregistrée', {}, TIMEOUT)).toBeInTheDocument();
    const saved = (await ds.repo('anomalies').list()).find((a) => a.description === 'Ruban mal enroulé sur trois faisceaux');
    expect(saved).toMatchObject({ workstationId: 'ws-p4', origin: { type: 'qr' }, reportedBy: 'u-nadia', status: 'open' });
  });
});

describe('andon', () => {
  it('prise en charge puis résolution avec cause obligatoire', async () => {
    const { user, ds } = renderApp('/andon', { userId: 'u-yann' });
    await user.click(await screen.findByRole('button', { name: 'Je prends en charge' }, TIMEOUT));
    await waitFor(async () => expect((await ds.repo('andonAlerts').get('ad-live-1')).status).toBe('acknowledged'), TIMEOUT);

    await user.click(screen.getAllByRole('button', { name: 'Résoudre' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: /Résoudre l’Andon/ });
    await user.click(within(dialog).getByRole('button', { name: 'Marquer résolu' }));
    expect(await within(dialog).findByText('Indiquez la cause identifiée')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Cause identifiée/), 'Outil usé');
    await user.type(within(dialog).getByLabelText(/Action réalisée/), 'Outil remplacé');
    await user.click(within(dialog).getByRole('button', { name: 'Marquer résolu' }));
    await waitFor(async () => {
      const alert = await ds.repo('andonAlerts').get('ad-live-1');
      expect(alert).toMatchObject({ status: 'resolved', rootCause: 'Outil usé', resolvedBy: 'u-yann' });
    }, TIMEOUT);
  });
});

describe('actions', () => {
  it('créer une action puis la terminer', async () => {
    const { user, ds } = renderApp('/actions', { userId: 'u-karim' });
    await user.click(await screen.findByRole('button', { name: 'Nouvelle action' }, TIMEOUT));
    const drawer = await screen.findByRole('dialog', { name: 'Nouvelle action' });
    await user.type(within(drawer).getByLabelText(/^Action/), 'Former Nadia au nouveau rubanage');
    await user.selectOptions(within(drawer).getByLabelText(/Responsable/), 'u-karim');
    await user.click(within(drawer).getByRole('button', { name: 'Créer l’action' }));

    const link = await screen.findByRole('link', { name: 'Former Nadia au nouveau rubanage' }, TIMEOUT);
    await user.click(link);
    await user.click(await screen.findByRole('button', { name: 'Marquer terminée' }, TIMEOUT));
    await waitFor(async () => {
      const created = (await ds.repo('actions').list()).find((a) => a.title === 'Former Nadia au nouveau rubanage');
      expect(created).toMatchObject({ status: 'done', assigneeId: 'u-karim' });
      expect(created?.closedAt).toBeDefined();
    }, TIMEOUT);
  });
});

describe('reporting', () => {
  it('change de période et reflète le choix dans l’URL', async () => {
    const { user, router } = renderApp('/reporting', { userId: 'u-dupont' });
    expect(await screen.findByText('7 derniers jours', {}, TIMEOUT)).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: '30 jours' }));
    expect(await screen.findByText('30 derniers jours')).toBeInTheDocument();
    expect(router.state.location.search).toContain('periode=30d');
  });
});
