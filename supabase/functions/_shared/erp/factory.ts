import type { ErpAdapter } from './adapter.ts';
import { MOCK_SCENARIOS, MockSapAdapter, type MockScenario } from './mockSapAdapter.ts';
import { ErpNotConfiguredError, type IntegrationMode } from './types.ts';

/* Choix de l'adaptateur selon le réglage serveur SAP_INTEGRATION_MODE (jamais une variable du navigateur).
   - off  : intégration désactivée ;
   - mock : Mock SAP (valeur par défaut tant qu'aucun SAP réel n'est connu) ;
   - real : connecteur réel — NON IMPLÉMENTÉ : refus explicite, aucune connexion tentée. */

export function parseIntegrationMode(value: string | undefined | null): IntegrationMode {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '') return 'mock';
  if (v === 'off' || v === 'mock' || v === 'real') return v;
  // Valeur inconnue : on n'intègre rien plutôt que de deviner
  return 'off';
}

export function parseScenario(value: unknown): MockScenario {
  return typeof value === 'string' && (MOCK_SCENARIOS as readonly string[]).includes(value) ? (value as MockScenario) : 'success';
}

export function createErpAdapter(
  mode: IntegrationMode,
  options: { scenario?: MockScenario; dataVersion?: 1 | 2; referenceDate?: Date } = {},
): ErpAdapter {
  if (mode === 'mock') return new MockSapAdapter(options);
  // Point d'extension : instancier ici l'adaptateur réel une fois l'environnement SAP connu (docs/ERP_INTEGRATION.md §8)
  throw new ErpNotConfiguredError(mode === 'off' ? 'Intégration ERP désactivée (SAP_INTEGRATION_MODE=off)' : undefined);
}
