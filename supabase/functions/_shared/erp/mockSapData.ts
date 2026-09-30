/* Jeu de données du MOCK SAP — SIMULATION, ne provient d'aucun système SAP.
   Structure réaliste pour un atelier de câblage (faisceaux, fils, cosses, connecteurs), numéros neutres :
   aucun format propre à une version de SAP n'est imité. Déterministe : mêmes paramètres → mêmes données.
   Les dates sont relatives au lundi de la semaine de référence, donc stables d'une synchronisation à l'autre. */

import type {
  ErpMaintenanceNotification,
  ErpMaterial,
  ErpProductionOrder,
  ErpQualityNotification,
  ErpStock,
  ErpStockMovement,
  ErpWorkCenter,
} from './types.ts';

export interface MockDataset {
  workCenters: ErpWorkCenter[];
  materials: ErpMaterial[];
  productionOrders: ErpProductionOrder[];
  stocks: ErpStock[];
  stockMovements: ErpStockMovement[];
  qualityNotifications: ErpQualityNotification[];
  maintenanceNotifications: ErpMaintenanceNotification[];
}

/** Lundi (UTC) de la semaine contenant `date` */
export function weekStart(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

export function buildMockDataset(referenceDate: Date, dataVersion: 1 | 2): MockDataset {
  const monday = weekStart(referenceDate);
  const day = (offset: number) => {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const at = (offset: number, hour: number) => `${day(offset)}T${String(hour).padStart(2, '0')}:00:00.000Z`;

  const workCenters: ErpWorkCenter[] = [
    ['P1', 'Sertissage', 'Presse de sertissage semi-automatique'],
    ['P2', 'Coupe et dénudage', 'Machine de coupe fil, ligne A'],
    ['P3', 'Assemblage', 'Planche d’assemblage faisceau'],
    ['P4', 'Rubanage', 'Rubanage et pose de gaines'],
    ['P5', 'Test électrique', 'Banc de test de continuité'],
    ['P6', 'Contrôle qualité', 'Contrôle final LQC'],
    ['P7', 'Kitting et expédition', 'Préparation des expéditions'],
    ['P8', 'Coupe ligne B', 'Machine de coupe fil, ligne B'],
  ].map(([p, name, description]) => ({ externalId: `WC-CAB-${p}`, code: `CAB-${p}`, name, description }));

  const materials: ErpMaterial[] = [
    ['HF-2210-A', 'Faisceau moteur 2210 version A', 'finished_harness', 'PC'],
    ['HF-2210-B', 'Faisceau moteur 2210 version B', 'finished_harness', 'PC'],
    ['HF-3105', 'Faisceau habitacle 3105', 'finished_harness', 'PC'],
    ['HF-4020', 'Faisceau porte avant 4020', 'finished_harness', 'PC'],
    ['FIL-FLRY-035-RG', 'Fil FLRY-B 0,35 mm² rouge', 'wire', 'M'],
    ['FIL-FLRY-050-NR', 'Fil FLRY-B 0,50 mm² noir', 'wire', 'M'],
    ['FIL-FLRY-150-BL', 'Fil FLRY-B 1,50 mm² bleu', 'wire', 'M'],
    ['COS-MQS-F-063', 'Cosse femelle 0,63 mm étamée', 'terminal', 'PC'],
    ['COS-MCP-F-150', 'Cosse femelle 1,5 mm', 'terminal', 'PC'],
    ['CON-12V-GR', 'Boîtier connecteur 12 voies gris', 'connector', 'PC'],
    ['GAI-ANN-10', 'Gaine annelée diamètre 10', 'sleeve', 'M'],
    ['RUB-PVC-19-NR', 'Ruban PVC 19 mm noir', 'tape', 'RL'],
  ].map(([materialNumber, description, type, baseUnit]) => ({
    externalId: `MAT-${materialNumber}`,
    materialNumber,
    description,
    type: type as ErpMaterial['type'],
    baseUnit,
  }));

  type OrderRow = [string, string, number, number, ErpProductionOrder['status'], string, number, number];
  const orderRows: OrderRow[] = [
    ['1004571', 'HF-2210-A', 240, 240, 'completed', 'P7', -3, -1],
    ['1004572', 'HF-2210-A', 180, 132, 'in_progress', 'P4', -1, 1],
    ['1004573', 'HF-2210-B', 120, 45, 'in_progress', 'P3', 0, 2],
    ['1004574', 'HF-3105', 300, 0, 'released', 'P2', 1, 3],
    ['1004575', 'HF-3105', 150, 0, 'released', 'P8', 2, 4],
    ['1004576', 'HF-4020', 90, 90, 'closed', 'P7', -7, -5],
    ['1004577', 'HF-4020', 200, 60, 'in_progress', 'P5', -1, 2],
    ['1004578', 'HF-2210-B', 160, 0, 'planned', 'P1', 3, 5],
    ['1004579', 'HF-3105', 220, 0, 'planned', 'P2', 4, 7],
    ['1004580', 'HF-4020', 110, 0, 'planned', 'P8', 5, 8],
  ];
  if (dataVersion === 2) {
    // Évolution simulée : avancement, clôture, et deux nouveaux ordres
    orderRows[1] = ['1004572', 'HF-2210-A', 180, 180, 'completed', 'P7', -1, 1];
    orderRows[2] = ['1004573', 'HF-2210-B', 120, 96, 'in_progress', 'P4', 0, 2];
    orderRows[3] = ['1004574', 'HF-3105', 300, 40, 'in_progress', 'P3', 1, 3];
    orderRows.push(['1004581', 'HF-2210-A', 260, 0, 'planned', 'P1', 6, 9], ['1004582', 'HF-3105', 140, 0, 'released', 'P2', 2, 4]);
  }
  const description = new Map(materials.map((m) => [m.materialNumber, m.description]));
  const productionOrders: ErpProductionOrder[] = orderRows.map(([orderNumber, mat, planned, confirmed, status, wc, start, end], i) => ({
    externalId: `PO-${orderNumber}`,
    orderNumber,
    materialNumber: mat,
    description: description.get(mat) ?? mat,
    plannedQuantity: planned,
    confirmedQuantity: confirmed,
    unit: 'PC',
    workCenterCode: `CAB-${wc}`,
    status,
    plannedStart: day(start),
    plannedEnd: day(end),
    // Les ordres modifiés en version 2 ont un horodatage plus récent
    updatedAt: dataVersion === 2 && i >= 1 && i <= 3 ? at(1, 14) : at(Math.min(start, 0), 6),
  }));

  type StockRow = [string, string, number, string];
  const stockRows: StockRow[] = [
    ['FIL-FLRY-035-RG', 'MAG-FIL', 4200, 'M'],
    ['FIL-FLRY-050-NR', 'MAG-FIL', 3100, 'M'],
    ['FIL-FLRY-150-BL', 'MAG-FIL', 850, 'M'],
    ['COS-MQS-F-063', 'KAN-P1', 12500, 'PC'],
    ['COS-MCP-F-150', 'KAN-P1', 1800, 'PC'],
    ['CON-12V-GR', 'KAN-P3', 640, 'PC'],
    ['GAI-ANN-10', 'KAN-P4', 320, 'M'],
    ['RUB-PVC-19-NR', 'KAN-P4', 46, 'RL'],
    ['HF-2210-A', 'EXP-QUAI', 240, 'PC'],
    ['HF-4020', 'EXP-QUAI', 90, 'PC'],
  ];
  if (dataVersion === 2) {
    stockRows[5] = ['CON-12V-GR', 'KAN-P3', 410, 'PC'];
    stockRows[7] = ['RUB-PVC-19-NR', 'KAN-P4', 12, 'RL'];
  }
  const stocks: ErpStock[] = stockRows.map(([materialNumber, location, quantity, unit], i) => ({
    externalId: `STK-${materialNumber}-${location}`,
    materialNumber,
    location,
    quantity,
    unit,
    updatedAt: dataVersion === 2 && (i === 5 || i === 7) ? at(1, 14) : at(0, 5),
  }));

  type MoveRow = [string, string, number, string, ErpStockMovement['movementType'], number, number, string?];
  const moveRows: MoveRow[] = [
    ['FIL-FLRY-035-RG', 'MAG-FIL', 5000, 'M', 'goods_receipt', -4, 9],
    ['FIL-FLRY-035-RG', 'MAG-FIL', -800, 'M', 'goods_issue', -1, 7, '1004572'],
    ['COS-MQS-F-063', 'KAN-P1', 20000, 'PC', 'goods_receipt', -3, 10],
    ['COS-MQS-F-063', 'KAN-P1', -7500, 'PC', 'goods_issue', -1, 8, '1004572'],
    ['CON-12V-GR', 'KAN-P3', -360, 'PC', 'goods_issue', 0, 9, '1004573'],
    ['GAI-ANN-10', 'MAG-GEN', -200, 'M', 'transfer', -2, 11],
    ['GAI-ANN-10', 'KAN-P4', 200, 'M', 'transfer', -2, 11],
    ['RUB-PVC-19-NR', 'KAN-P4', -14, 'RL', 'goods_issue', 0, 13, '1004572'],
    ['HF-2210-A', 'EXP-QUAI', 240, 'PC', 'goods_receipt', -1, 15, '1004571'],
    ['HF-4020', 'EXP-QUAI', 90, 'PC', 'goods_receipt', -5, 15, '1004576'],
  ];
  if (dataVersion === 2) moveRows.push(['CON-12V-GR', 'KAN-P3', -230, 'PC', 'goods_issue', 1, 10, '1004574']);
  const stockMovements: ErpStockMovement[] = moveRows.map(
    ([materialNumber, location, quantity, unit, movementType, d, h, orderNumber], i) => ({
      externalId: `MV-${5003100 + i}`,
      materialNumber,
      location,
      quantity,
      unit,
      movementType,
      postedAt: at(d, h),
      ...(orderNumber ? { orderNumber } : {}),
    }),
  );

  const qualityNotifications: ErpQualityNotification[] = [
    ['2000781', 'Hauteur de sertissage hors tolérance', 'COS-MQS-F-063', 'P1', 'high', dataVersion === 2 ? 'closed' : 'in_progress', -2],
    ['2000782', 'Repérage de fil inversé sur connecteur 12 voies', 'CON-12V-GR', 'P3', 'medium', 'open', -1],
    ['2000783', 'Longueur de coupe hors tolérance', 'FIL-FLRY-050-NR', 'P2', 'low', 'closed', -6],
    ['2000784', 'Défaut de continuité au test électrique', 'HF-4020', 'P5', 'high', 'open', 0],
  ].map(([number, title, materialNumber, wc, priority, status, d]) => ({
    externalId: `QN-${number}`,
    number: number as string,
    title: title as string,
    materialNumber: materialNumber as string,
    workCenterCode: `CAB-${wc}`,
    priority: priority as ErpQualityNotification['priority'],
    status: status as ErpQualityNotification['status'],
    reportedAt: at(d as number, 10),
  }));

  const maintenanceNotifications: ErpMaintenanceNotification[] = [
    ['3001204', 'Usure de l’outil de sertissage', 'Presse de sertissage P1', 'P1', 'high', 'in_progress', -1],
    ['3001205', 'Lame de coupe à remplacer', 'Machine de coupe P2', 'P2', 'medium', 'open', 0],
    ['3001206', 'Étalonnage annuel du banc de test', 'Banc de test P5', 'P5', 'low', 'open', 2],
    ['3001207', 'Fuite d’air sur la presse', 'Presse de sertissage P1', 'P1', 'medium', 'closed', -8],
  ].map(([number, title, equipment, wc, priority, status, d]) => ({
    externalId: `MN-${number}`,
    number: number as string,
    title: title as string,
    equipment: equipment as string,
    workCenterCode: `CAB-${wc}`,
    priority: priority as ErpMaintenanceNotification['priority'],
    status: status as ErpMaintenanceNotification['status'],
    reportedAt: at(d as number, 8),
  }));

  return { workCenters, materials, productionOrders, stocks, stockMovements, qualityNotifications, maintenanceNotifications };
}
