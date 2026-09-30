import type { ErpAdapter } from './adapter.ts';
import { contentHash } from './hash.ts';
import { buildMockDataset, type MockDataset } from './mockSapData.ts';
import { ErpRejectedError, ErpUnavailableError, type NotificationRequest, type NotificationResult } from './types.ts';

/* MOCK SAP — simulation d'un système ERP pour construire et tester l'intégration sans SAP réel.
   Aucune connexion réseau. Les scénarios reproduisent les situations que le vrai connecteur devra gérer. */

export const MOCK_SCENARIOS = [
  'success',
  'unavailable',
  'timeout',
  'invalid',
  'duplicate',
  'partial',
  'send_error',
  'send_rejected',
  'recovery',
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const MOCK_SCENARIO_LABELS: Record<MockScenario, string> = {
  success: 'Synchronisation normale',
  unavailable: 'SAP indisponible',
  timeout: 'Délai de réponse dépassé',
  invalid: 'Réponse invalide (ordres de fabrication)',
  duplicate: 'Doublons dans la réponse',
  partial: 'Erreur partielle (enregistrements invalides)',
  send_error: 'Erreur lors de l’envoi d’une notification',
  send_rejected: 'Notification refusée définitivement',
  recovery: 'Reprise après erreur (premier appel en échec)',
};

export interface MockSapOptions {
  scenario?: MockScenario;
  /** 1 : jeu initial ; 2 : jeu modifié (mises à jour et nouveaux ordres) */
  dataVersion?: 1 | 2;
  /** Date de référence des données (défaut : maintenant) */
  referenceDate?: Date;
}

export class MockSapAdapter implements ErpAdapter {
  readonly system = 'SAP' as const;
  readonly simulated = true;
  readonly label = 'Mock SAP (simulation)';
  readonly scenario: MockScenario;
  private readonly data: MockDataset;
  /** Appels déjà effectués par méthode (scénario « recovery » : le premier échoue) */
  private readonly calls = new Map<string, number>();
  /** Avis déjà créés par clé d'idempotence (un renvoi renvoie le même avis) */
  private readonly created = new Map<string, NotificationResult>();

  constructor(options: MockSapOptions = {}) {
    this.scenario = options.scenario ?? 'success';
    this.data = buildMockDataset(options.referenceDate ?? new Date(), options.dataVersion ?? 1);
  }

  private async respond<T>(method: string, value: () => T): Promise<T> {
    const n = (this.calls.get(method) ?? 0) + 1;
    this.calls.set(method, n);
    if (this.scenario === 'unavailable') throw new ErpUnavailableError('Mock SAP : service indisponible (simulation)');
    // Ne répond jamais : c'est le moteur de synchronisation qui doit interrompre l'appel
    if (this.scenario === 'timeout') return new Promise<T>(() => undefined);
    if (this.scenario === 'recovery' && n === 1) throw new ErpUnavailableError('Mock SAP : échec du premier appel (simulation)');
    return structuredClone(value());
  }

  getWorkCenters() {
    return this.respond('getWorkCenters', () => this.data.workCenters as unknown[]);
  }

  getMaterials() {
    return this.respond('getMaterials', () => this.data.materials as unknown[]);
  }

  getProductionOrders() {
    return this.respond('getProductionOrders', (): unknown[] => {
      const orders = this.data.productionOrders as unknown[];
      switch (this.scenario) {
        case 'invalid':
          // Réponse inexploitable (ex. page d'erreur à la place des données)
          return { error: 'Internal Server Error', body: '<html>…</html>' } as unknown as unknown[];
        case 'duplicate': {
          const [first, second] = this.data.productionOrders;
          // Doublon strictement identique + doublon contradictoire (même identifiant, contenus différents)
          return [...orders, structuredClone(first), { ...structuredClone(second), confirmedQuantity: second.confirmedQuantity + 7 }];
        }
        case 'partial':
          return [
            ...orders,
            { externalId: 'PO-1004590', materialNumber: 'HF-3105', description: 'Sans numéro d’ordre', plannedQuantity: 10 },
            { ...structuredClone(this.data.productionOrders[4]), externalId: 'PO-1004591', orderNumber: '1004591', plannedQuantity: -5 },
          ];
        default:
          return orders;
      }
    });
  }

  getMaterialStocks() {
    return this.respond('getMaterialStocks', (): unknown[] =>
      this.scenario === 'partial'
        ? [...this.data.stocks, { ...structuredClone(this.data.stocks[0]), externalId: 'STK-INVALIDE', updatedAt: 'hier' }]
        : this.data.stocks,
    );
  }

  getStockMovements() {
    return this.respond('getStockMovements', () => this.data.stockMovements as unknown[]);
  }

  getQualityNotifications() {
    return this.respond('getQualityNotifications', () => this.data.qualityNotifications as unknown[]);
  }

  getMaintenanceNotifications() {
    return this.respond('getMaintenanceNotifications', () => this.data.maintenanceNotifications as unknown[]);
  }

  createQualityNotification(request: NotificationRequest, idempotencyKey: string) {
    return this.createNotification('createQualityNotification', '2009', request, idempotencyKey);
  }

  createMaintenanceNotification(request: NotificationRequest, idempotencyKey: string) {
    return this.createNotification('createMaintenanceNotification', '3009', request, idempotencyKey);
  }

  private async createNotification(method: string, prefix: string, request: NotificationRequest, key: string) {
    if (this.scenario === 'send_error') throw new ErpUnavailableError('Mock SAP : envoi impossible (simulation)');
    if (this.scenario === 'send_rejected') throw new ErpRejectedError('Mock SAP : avis refusé (simulation)');
    return this.respond(method, () => null).then(async () => {
      if (!request?.title?.trim()) throw new ErpRejectedError('Mock SAP : titre de l’avis manquant');
      const known = this.created.get(key);
      if (known) return known;
      // Numéro déterministe dérivé de la clé : un renvoi, même depuis une autre exécution, donne le même avis
      const digits = (await contentHash(key)).replace(/[a-f]/g, '').padEnd(4, '0').slice(0, 4);
      const number = `${prefix}${digits}`;
      const result = { externalId: `${prefix === '2009' ? 'QN' : 'MN'}-${number}`, number };
      this.created.set(key, result);
      return result;
    });
  }
}
