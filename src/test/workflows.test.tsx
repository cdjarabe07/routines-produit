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
  it('connexion par identifiant et mot de passe ; aucune mention du mode démo', async () => {
    const { user } = renderApp('/');
    await user.type(await screen.findByLabelText(/Identifiant ou email/, {}, TIMEOUT), 'karim.benali@atelier.local');
    await user.type(screen.getByLabelText(/^Mot de passe/), 'Routines2026');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Bonjour Karim/ }, TIMEOUT)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/démo|démonstration|fictive/i);
  });

  it('refuse un mauvais mot de passe et un compte désactivé', async () => {
    const { user, ds } = renderApp('/login');
    await ds.repo('users').update('u-tom', { active: false });
    await user.type(await screen.findByLabelText(/Identifiant ou email/, {}, TIMEOUT), 'operateur');
    await user.type(screen.getByLabelText(/^Mot de passe/), 'mauvais');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Identifiant ou mot de passe incorrect.', {}, TIMEOUT)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Identifiant ou email/));
    await user.type(screen.getByLabelText(/Identifiant ou email/), 'tom.berg@atelier.local');
    await user.type(screen.getByLabelText(/^Mot de passe/), 'Routines2026');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText(/Ce compte est désactivé/, {}, TIMEOUT)).toBeInTheDocument();
  });

  it('mot de passe oublié : la demande est transmise aux administrateurs', async () => {
    const { user, ds } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Mot de passe oublié ?' }, TIMEOUT));
    await user.type(screen.getByLabelText(/Identifiant ou email/), 'operateur');
    await user.click(screen.getByRole('button', { name: 'Transmettre la demande' }));
    expect(await screen.findByText(/Demande transmise/, {}, TIMEOUT)).toBeInTheDocument();
    const notes = await ds.repo('notifications').list({ where: { userId: 'u-admin' } });
    expect(notes.some((n) => n.kind === 'access_request' && n.title.includes('Nadia Roussel'))).toBe(true);
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

describe('espaces et gardes', () => {
  it('chaque profil arrive sur son espace', async () => {
    const { router } = renderApp('/', { userId: 'u-nadia' });
    expect(await screen.findByRole('heading', { level: 1, name: /Bonjour Nadia/ }, TIMEOUT)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('un opérateur n’accède ni à l’administration ni à la supervision', async () => {
    renderApp('/admin/planification', { userId: 'u-nadia' });
    expect(await screen.findByText('Accès non autorisé', {}, TIMEOUT)).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!;
    expect(within(nav).queryByRole('button', { name: 'Administration' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: 'Supervision' })).not.toBeInTheDocument();
  });

  it('le manager planifie mais ne gère pas les utilisateurs', async () => {
    renderApp('/admin/utilisateurs', { userId: 'u-dupont' });
    expect(await screen.findByText('Accès non autorisé', {}, TIMEOUT)).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Navigation principale' })[0]!;
    expect(within(nav).getByRole('link', { name: 'Planification' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Utilisateurs' })).not.toBeInTheDocument();
  });
});

describe('routines', () => {
  it('démarrer, exécuter les tâches obligatoires, terminer : la durée réelle est enregistrée', async () => {
    const { user, ds } = renderApp('/app/routines/sc-op-5s-nadia/2026-09-29', { userId: 'u-nadia' });
    await user.click(await screen.findByRole('button', { name: 'Démarrer' }, TIMEOUT));
    const finish = await screen.findByRole('button', { name: 'Terminer la routine' }, TIMEOUT);
    expect(finish).toBeDisabled();

    for (const label of ['Outillage inutile retiré', 'Chaque outil à son emplacement', 'Plan de travail nettoyé']) {
      await user.click(within(screen.getByRole('group', { name: `Résultat : ${label}` })).getByRole('button', { name: /^Conforme$/ }));
    }
    await user.click(
      within(screen.getByRole('group', { name: 'Réponse : Aucune chute de câble au sol' })).getByRole('button', { name: 'Oui' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Terminer la routine' })).toBeEnabled(), TIMEOUT);

    await user.click(screen.getByRole('button', { name: 'Terminer la routine' }));
    const dialog = await screen.findByRole('dialog', { name: 'Routine terminée' });
    expect(within(dialog).getByText('Tâches complétées')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Terminer' }));

    await waitFor(async () => {
      const run = (await ds.repo('routineRuns').list({ where: { scheduleId: 'sc-op-5s-nadia', date: '2026-09-29' } }))[0];
      expect(run?.completedAt).toBeDefined();
      expect(run?.completedBy).toBe('u-nadia');
    }, TIMEOUT);
  });

  it('une routine d’une autre personne est en consultation seule pour la supervision', async () => {
    renderApp('/app/routines/sc-ha-crimp/2026-09-28', { userId: 'u-dupont' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Contrôle presses de sertissage' }, TIMEOUT)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Démarrer|Terminer la routine/ })).not.toBeInTheDocument();
    for (const b of screen.queryAllByRole('button', { name: /^Conforme$/ })) expect(b).toBeDisabled();
  });

  it('une routine non affectée est refusée à un opérateur', async () => {
    renderApp('/app/routines/sc-ll-audit/2026-09-29', { userId: 'u-nadia' });
    expect(await screen.findByText('Accès non autorisé', {}, TIMEOUT)).toBeInTheDocument();
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
    const closeDialog = await screen.findByRole('dialog', { name: 'Terminer l’action' });
    await user.type(within(closeDialog).getByLabelText(/Résolution/), 'Formation réalisée au poste');
    await user.click(within(closeDialog).getByRole('button', { name: 'Terminer' }));
    await waitFor(async () => {
      const created = (await ds.repo('actions').list()).find((a) => a.title === 'Former Nadia au nouveau rubanage');
      expect(created).toMatchObject({ status: 'done', assigneeId: 'u-karim', resolutionNote: 'Formation réalisée au poste' });
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
