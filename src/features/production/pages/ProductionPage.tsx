import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { QueryBoundary } from '@/components/feedback/States';
import { PageHeader, Stack } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { FormActions, FormGrid, SelectField, TextField } from '@/components/ui/Field';
import { Drawer, Modal } from '@/components/ui/Overlay';
import { Tabs } from '@/components/ui/Tabs';
import { PRODUCTION_STAGE, options } from '@/features/shared/labels';
import { useLookups, userOptions, type Lookups } from '@/features/shared/api';
import { useCollection } from '@/hooks/useData';
import { useForm } from '@/hooks/useForm';
import type { ProductionOrder, ProductionStage } from '@/types/domain';
import { addDays, todayKey } from '@/utils/date';
import { numberRange, required } from '@/utils/validation';
import { useCreateOrder, useUpdateOrder } from '../api';
import { OrderBoard } from '../components/OrderBoard';
import { StockPanel } from '../components/StockPanel';
import { needsReorder } from '../model';

export function ProductionPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('vue') === 'stocks' ? 'stocks' : 'orders';
  const [lineFilter, setLineFilter] = useState('all');
  const [showDone, setShowDone] = useState(false);
  const orders = useCollection('productionOrders');
  const stocks = useCollection('materialStocks');
  const movements = useCollection('stockMovements');
  const { queries, lookups } = useLookups();
  const update = useUpdateOrder();
  const confirm = useConfirm();
  const [blocking, setBlocking] = useState<ProductionOrder | null>(null);
  const [quantityFor, setQuantityFor] = useState<ProductionOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const editable = can('production.update');
  const today = todayKey();

  return (
    <>
      <PageHeader
        title="Production"
        description="Ordres de fabrication par étape et stocks matières aux postes."
        meta={<Badge>Saisie manuelle — aucun système MES/ERP connecté</Badge>}
        actions={
          editable &&
          tab === 'orders' && (
            <Button variant="primary" icon={<Plus size={16} aria-hidden />} onClick={() => setCreating(true)}>
              Nouvel OF
            </Button>
          )
        }
      />
      <QueryBoundary queries={[orders, stocks, movements, ...queries]}>
        {() => {
          const lowStocks = stocks.data!.filter(needsReorder).length;
          const visible = orders.data!.filter(
            (o) => (lineFilter === 'all' || o.lineId === lineFilter) && (showDone || o.status !== 'done'),
          );
          const blocked = orders.data!.filter((o) => o.status === 'blocked').length;
          return (
            <Stack>
              <Tabs
                label="Vue"
                value={tab}
                onChange={(v) => setParams(v === 'stocks' ? { vue: 'stocks' } : {}, { replace: true })}
                items={[
                  { value: 'orders', label: 'Ordres de fabrication', count: blocked || undefined },
                  { value: 'stocks', label: 'Stocks matières', count: lowStocks || undefined },
                ]}
              />
              {tab === 'orders' ? (
                <>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Tabs
                      variant="segmented"
                      label="Ligne"
                      value={lineFilter}
                      onChange={setLineFilter}
                      items={[{ value: 'all', label: 'Toutes les lignes' }, ...lookups!.lines.map((l) => ({ value: l.id, label: l.name }))]}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' }}>
                      <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Afficher les OF terminés
                    </label>
                  </div>
                  <OrderBoard
                    orders={visible}
                    lookups={lookups!}
                    today={today}
                    editable={editable}
                    onMove={(o, stage) =>
                      update.mutate({ id: o.id, patch: { stage, status: o.status === 'planned' ? 'in_progress' : o.status } })
                    }
                    onBlock={setBlocking}
                    onUnblock={(o) => update.mutate({ id: o.id, patch: { status: 'in_progress', blockedReason: undefined } })}
                    onQuantity={setQuantityFor}
                    onComplete={async (o) => {
                      if (
                        await confirm({
                          title: `Terminer ${o.reference} ?`,
                          message: `Quantité produite : ${o.quantityDone}/${o.quantityPlanned}.`,
                          confirmLabel: 'Terminer',
                        })
                      ) {
                        update.mutate({ id: o.id, patch: { status: 'done', blockedReason: undefined } });
                      }
                    }}
                  />
                </>
              ) : (
                <StockPanel stocks={stocks.data!} movements={movements.data!} lookups={lookups!} editable={editable} />
              )}

              <BlockDialog
                order={blocking}
                onClose={() => setBlocking(null)}
                onConfirm={(reason) =>
                  blocking && update.mutateAsync({ id: blocking.id, patch: { status: 'blocked', blockedReason: reason } })
                }
              />
              <QuantityDialog
                order={quantityFor}
                onClose={() => setQuantityFor(null)}
                onConfirm={(q) => quantityFor && update.mutateAsync({ id: quantityFor.id, patch: { quantityDone: q } })}
              />
              <Drawer open={creating} onClose={() => setCreating(false)} title="Nouvel ordre de fabrication" size="md">
                {creating && <OrderForm lookups={lookups!} onDone={() => setCreating(false)} />}
              </Drawer>
            </Stack>
          );
        }}
      </QueryBoundary>
    </>
  );
}

function BlockDialog({
  order,
  onClose,
  onConfirm,
}: {
  order: ProductionOrder | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown> | null;
}) {
  const form = useForm({
    initial: { reason: '' },
    rules: { reason: [required('Indiquez la cause du blocage')] },
    onSubmit: async (v) => {
      await onConfirm(v.reason.trim());
      form.reset();
      onClose();
    },
  });
  return (
    <Modal
      open={order !== null}
      onClose={() => {
        form.reset();
        onClose();
      }}
      title={`Blocage — ${order?.reference ?? ''}`}
      size="sm"
    >
      <form onSubmit={form.handleSubmit} noValidate>
        <TextField
          label="Cause du blocage"
          required
          value={form.values.reason}
          onChange={(e) => form.set('reason', e.target.value)}
          error={form.errors.reason}
          placeholder="Ex. : rupture de terminaux au poste 1"
          data-autofocus
        />
        <FormActions>
          <Button
            onClick={() => {
              form.reset();
              onClose();
            }}
          >
            Annuler
          </Button>
          <Button type="submit" variant="danger" loading={form.submitting}>
            Bloquer l’OF
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

function QuantityDialog({
  order,
  onClose,
  onConfirm,
}: {
  order: ProductionOrder | null;
  onClose: () => void;
  onConfirm: (q: number) => Promise<unknown> | null;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setValue('');
    setError(null);
    onClose();
  };
  return (
    <Modal
      open={order !== null}
      onClose={close}
      title={`Quantité produite — ${order?.reference ?? ''}`}
      description={order ? `Prévu : ${order.quantityPlanned} · actuel : ${order.quantityDone}` : undefined}
      size="sm"
    >
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Number(value);
          if (value === '' || Number.isNaN(n) || n < 0 || !Number.isInteger(n)) return setError('Saisissez un nombre entier positif.');
          if (order && n > order.quantityPlanned * 1.2)
            return setError(`Valeur improbable (prévu : ${order.quantityPlanned}). Vérifiez la saisie.`);
          await onConfirm(n);
          close();
        }}
      >
        <TextField
          label="Quantité totale produite"
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error ?? undefined}
          data-autofocus
        />
        <FormActions>
          <Button onClick={close}>Annuler</Button>
          <Button type="submit" variant="primary">
            Enregistrer
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}

function OrderForm({ lookups, onDone }: { lookups: Lookups; onDone: () => void }) {
  const create = useCreateOrder();
  const form = useForm({
    initial: {
      reference: '',
      harnessRef: '',
      lineId: lookups.lines[0]?.id ?? '',
      quantityPlanned: '',
      stage: 'cutting' as ProductionStage,
      ownerId: '',
      dueDate: addDays(todayKey(), 1),
    },
    rules: {
      reference: [required('Référence de l’OF obligatoire')],
      harnessRef: [required('Référence faisceau obligatoire')],
      lineId: [required()],
      quantityPlanned: [required('Quantité obligatoire'), numberRange(1, 100000)],
      dueDate: [required()],
    },
    onSubmit: async (v) => {
      await create.mutateAsync({
        reference: v.reference.trim(),
        harnessRef: v.harnessRef.trim(),
        lineId: v.lineId,
        quantityPlanned: Number(v.quantityPlanned),
        quantityDone: 0,
        stage: v.stage,
        status: 'planned',
        ownerId: v.ownerId || undefined,
        dueDate: v.dueDate,
      });
      onDone();
    },
  });
  const { values, set, errors } = form;
  return (
    <form onSubmit={form.handleSubmit} noValidate>
      <FormGrid>
        <TextField
          label="Référence OF"
          required
          value={values.reference}
          onChange={(e) => set('reference', e.target.value)}
          error={errors.reference}
          placeholder="OF-2660"
        />
        <TextField
          label="Référence faisceau"
          required
          value={values.harnessRef}
          onChange={(e) => set('harnessRef', e.target.value)}
          error={errors.harnessRef}
        />
        <SelectField
          label="Ligne"
          options={lookups.lines.map((l) => ({ value: l.id, label: l.name }))}
          value={values.lineId}
          onChange={(e) => set('lineId', e.target.value)}
        />
        <TextField
          label="Quantité prévue"
          required
          type="number"
          min={1}
          value={values.quantityPlanned}
          onChange={(e) => set('quantityPlanned', e.target.value)}
          error={errors.quantityPlanned}
        />
        <SelectField
          label="Étape de départ"
          options={options(PRODUCTION_STAGE)}
          value={values.stage}
          onChange={(e) => set('stage', e.target.value as ProductionStage)}
        />
        <TextField
          label="Échéance"
          required
          type="date"
          value={values.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
          error={errors.dueDate}
        />
        <SelectField
          className="full"
          label="Responsable"
          placeholder="Non attribué"
          options={userOptions(lookups.activeUsers)}
          value={values.ownerId}
          onChange={(e) => set('ownerId', e.target.value)}
        />
      </FormGrid>
      <FormActions>
        <Button onClick={onDone}>Annuler</Button>
        <Button type="submit" variant="primary" loading={form.submitting}>
          Créer l’OF
        </Button>
      </FormActions>
    </form>
  );
}
