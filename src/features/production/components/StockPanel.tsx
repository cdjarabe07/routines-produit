import { useMemo, useState } from 'react';
import { useCurrentUser } from '@/app/providers/AuthProvider';
import { DataTable, type Column } from '@/components/data-display/DataTable';
import { ItemList } from '@/components/data-display/ItemList';
import { EmptyState } from '@/components/feedback/States';
import { Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FormActions, FormGrid, SelectField, TextField } from '@/components/ui/Field';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { Panel } from '@/components/ui/Panel';
import { Progress } from '@/components/ui/Progress';
import { workstationOptions, type Lookups } from '@/features/shared/api';
import { useForm } from '@/hooks/useForm';
import { numberRange, required } from '@/utils/validation';
import type { MaterialStock, StockMovement, StockMovementReason } from '@/types/domain';
import { formatDateTime } from '@/utils/date';
import { useSaveStock, useStockMovement } from '../api';
import { STOCK_STATE, reorderQuantity, stockState } from '../model';

const REASONS: Record<StockMovementReason, string> = {
  consumption: 'Consommation',
  replenishment: 'Réapprovisionnement',
  adjustment: 'Correction d’inventaire',
};

export function StockPanel({
  stocks,
  movements,
  lookups,
  editable,
}: {
  stocks: MaterialStock[];
  movements: StockMovement[];
  lookups: Lookups;
  editable: boolean;
}) {
  const [target, setTarget] = useState<MaterialStock | null>(null);
  const [editing, setEditing] = useState<MaterialStock | 'new' | null>(null);
  const stockById = useMemo(() => new Map(stocks.map((s) => [s.id, s])), [stocks]);
  const shortStation = (id: string) => {
    const w = lookups.workstationById.get(id);
    return w ? `${w.code} · ${w.process}` : '—';
  };

  const columns: Column<MaterialStock>[] = [
    { id: 'material', header: 'Matière', mobile: 'title', cell: (s) => s.material, sortValue: (s) => s.material },
    {
      id: 'ws',
      header: 'Poste',
      mobile: 'meta',
      cell: (s) => shortStation(s.workstationId),
      sortValue: (s) => lookups.workstationById.get(s.workstationId)?.code ?? '',
    },
    {
      id: 'qty',
      header: 'Stock',
      mobile: 'meta',
      width: '220px',
      cell: (s) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 60 }}>
            <Progress
              value={s.quantity}
              max={s.target}
              label={`Stock ${s.material}`}
              tone={
                STOCK_STATE[stockState(s)].tone === 'danger'
                  ? 'danger'
                  : STOCK_STATE[stockState(s)].tone === 'warning'
                    ? 'warning'
                    : 'success'
              }
              size="sm"
            />
          </div>
          <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {s.quantity} {s.unit}
          </span>
        </div>
      ),
      sortValue: (s) => s.quantity / (s.target || 1),
    },
    { id: 'thresholds', header: 'Mini / cible', mobile: 'meta', align: 'right', cell: (s) => `${s.min} / ${s.target}` },
    {
      id: 'reorder',
      header: 'À commander',
      mobile: 'meta',
      align: 'right',
      cell: (s) => (reorderQuantity(s) > 0 ? `${reorderQuantity(s)} ${s.unit}` : '—'),
      sortValue: reorderQuantity,
    },
    {
      id: 'state',
      header: 'État',
      mobile: 'aside',
      cell: (s) => <Badge tone={STOCK_STATE[stockState(s)].tone}>{STOCK_STATE[stockState(s)].label}</Badge>,
      sortValue: (s) => STOCK_STATE[stockState(s)].rank,
    },
    ...(editable
      ? [
          {
            id: 'act',
            header: 'Mouvement',
            align: 'right' as const,
            mobile: 'meta' as const,
            cell: (s: MaterialStock) => (
              <div style={{ display: 'inline-flex', gap: 6 }}>
                <Button size="sm" onClick={() => setTarget(s)}>
                  Saisir
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                  Seuils
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ];

  const recent = [...movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12);

  return (
    <Stack>
      <Panel
        flush
        title="Stocks aux postes"
        description="Règle kanban : sous le minimum, réapprovisionner jusqu’à la cible."
        actions={
          editable && (
            <Button size="sm" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing('new')}>
              Nouvelle référence
            </Button>
          )
        }
      >
        <DataTable
          caption="Stocks matières"
          rows={stocks}
          columns={columns}
          rowKey={(s) => s.id}
          initialSort={{ id: 'state', direction: 'asc' }}
          rowTone={(s) => (STOCK_STATE[stockState(s)].tone === 'danger' ? 'danger' : undefined)}
          search={{ placeholder: 'Rechercher une matière', text: (s) => `${s.material} ${lookups.workstationName(s.workstationId)}` }}
          empty={{ title: 'Aucune référence matière suivie.' }}
        />
      </Panel>
      <Panel flush title="Derniers mouvements">
        {recent.length === 0 ? (
          <EmptyState compact title="Aucun mouvement saisi." />
        ) : (
          <ItemList
            items={recent.map((m) => {
              const s = stockById.get(m.stockId);
              return {
                id: m.id,
                title: `${m.delta > 0 ? '+' : ''}${m.delta} ${s?.unit ?? ''} · ${s?.material ?? 'Référence supprimée'}`,
                meta: `${REASONS[m.reason]} · ${lookups.userName(m.by)} · ${formatDateTime(m.createdAt)}`,
              };
            })}
          />
        )}
      </Panel>
      <MovementDialog stock={target} onClose={() => setTarget(null)} />
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nouvelle référence matière' : 'Seuils kanban'}
        description={editing !== null && editing !== 'new' ? editing.material : undefined}
        size="sm"
      >
        {editing !== null && (
          <StockForm stock={editing === 'new' ? undefined : editing} lookups={lookups} onDone={() => setEditing(null)} />
        )}
      </Drawer>
    </Stack>
  );
}

function MovementDialog({ stock, onClose }: { stock: MaterialStock | null; onClose: () => void }) {
  const user = useCurrentUser();
  const move = useStockMovement();
  const [reason, setReason] = useState<StockMovementReason>('consumption');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setQuantity('');
    setReason('consumption');
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={stock !== null}
      onClose={close}
      title={`Mouvement — ${stock?.material ?? ''}`}
      description={stock ? `Stock actuel : ${stock.quantity} ${stock.unit}` : undefined}
      size="sm"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(quantity);
          if (!quantity || Number.isNaN(n) || n <= 0) {
            setError('Saisissez une quantité positive.');
            return;
          }
          const delta = reason === 'consumption' ? -n : reason === 'replenishment' ? n : n - stock!.quantity;
          try {
            await move.mutateAsync({ stock: stock!, delta, reason, userId: user.id });
            close();
          } catch {
            /* message affiché */
          }
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        noValidate
      >
        <SelectField
          label="Type de mouvement"
          options={(Object.keys(REASONS) as StockMovementReason[]).map((r) => ({ value: r, label: REASONS[r] }))}
          value={reason}
          onChange={(e) => setReason(e.target.value as StockMovementReason)}
        />
        <TextField
          label={reason === 'adjustment' ? 'Quantité comptée' : 'Quantité'}
          type="number"
          min={0}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={error ?? undefined}
          hint={reason === 'adjustment' ? 'Le stock sera remplacé par la quantité comptée.' : undefined}
          data-autofocus
        />
        <FormActions>
          <Button onClick={close}>Annuler</Button>
          <Button type="submit" variant="primary" loading={move.isPending}>
            Enregistrer
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

/** Création d'une référence (avec stock initial) ou modification des seuils. Le stock ne se modifie que par mouvement tracé. */
function StockForm({ stock, lookups, onDone }: { stock?: MaterialStock; lookups: Lookups; onDone: () => void }) {
  const save = useSaveStock();
  const form = useForm({
    initial: {
      material: stock?.material ?? '',
      workstationId: stock?.workstationId ?? '',
      unit: stock?.unit ?? 'pcs',
      quantity: String(stock?.quantity ?? 0),
      min: String(stock?.min ?? ''),
      target: String(stock?.target ?? ''),
    },
    rules: {
      material: [required('Nom de la matière obligatoire')],
      workstationId: [required('Choisissez le poste')],
      unit: [required()],
      quantity: [required(), numberRange(0)],
      min: [required('Seuil minimum obligatoire'), numberRange(0)],
      target: [required('Cible obligatoire'), numberRange(1)],
    },
    onSubmit: async (v) => {
      await save.mutateAsync({
        id: stock?.id,
        input: {
          material: v.material.trim(),
          workstationId: v.workstationId,
          unit: v.unit.trim(),
          quantity: stock ? stock.quantity : Number(v.quantity),
          min: Number(v.min),
          target: Number(v.target),
        },
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  const inverted = values.min !== '' && values.target !== '' && Number(values.min) >= Number(values.target);
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid columns={1}>
        <TextField
          label="Matière"
          required
          value={values.material}
          onChange={(e) => set('material', e.target.value)}
          error={errors.material}
          disabled={Boolean(stock)}
        />
        <SelectField
          label="Poste"
          required
          placeholder="Choisir…"
          options={workstationOptions(lookups.workstations)}
          value={values.workstationId}
          onChange={(e) => set('workstationId', e.target.value)}
          error={errors.workstationId}
          disabled={Boolean(stock)}
        />
        <TextField
          label="Unité"
          required
          value={values.unit}
          onChange={(e) => set('unit', e.target.value)}
          error={errors.unit}
          disabled={Boolean(stock)}
        />
        {!stock && (
          <TextField
            label="Stock initial"
            type="number"
            min={0}
            value={values.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            error={errors.quantity}
          />
        )}
        <TextField
          label="Seuil minimum (réappro)"
          required
          type="number"
          min={0}
          value={values.min}
          onChange={(e) => set('min', e.target.value)}
          error={errors.min}
        />
        <TextField
          label="Cible"
          required
          type="number"
          min={1}
          value={values.target}
          onChange={(e) => set('target', e.target.value)}
          error={errors.target ?? (inverted ? 'La cible doit être supérieure au minimum' : undefined)}
        />
      </FormGrid>
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting} disabled={inverted}>
          Enregistrer
        </Button>
      </FormActions>
    </form>
  );
}
