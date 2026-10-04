import { stageLabel } from '@/app/catalog';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/Button';
import { Menu } from '@/components/ui/Menu';
import { Progress } from '@/components/ui/Progress';
import { PRODUCTION_STAGES, PRODUCTION_STATUS } from '@/features/shared/labels';
import type { Lookups } from '@/features/shared/api';
import type { DateKey, ProductionOrder } from '@/types/domain';
import { formatDate } from '@/utils/date';
import { cx } from '@/utils/cx';
import { nextStage, previousStage } from '../model';
import styles from './OrderBoard.module.css';

interface Props {
  orders: ProductionOrder[];
  lookups: Lookups;
  today: DateKey;
  editable: boolean;
  onMove: (order: ProductionOrder, stage: ProductionOrder['stage']) => void;
  onBlock: (order: ProductionOrder) => void;
  onUnblock: (order: ProductionOrder) => void;
  onQuantity: (order: ProductionOrder) => void;
  onComplete: (order: ProductionOrder) => void;
}

/** Tableau des OF par étape. Déplacement par boutons (tactile, clavier) — voir docs/decisions.md D-009. */
export function OrderBoard({ orders, lookups, today, editable, onMove, onBlock, onUnblock, onQuantity, onComplete }: Props) {
  return (
    <div className={styles.board}>
      {PRODUCTION_STAGES.map((stage) => {
        const column = orders.filter((o) => o.stage === stage);
        return (
          <section key={stage} className={styles.column} aria-label={`Étape ${stageLabel(stage)}`}>
            <header className={styles.columnHead}>
              <h2>{stageLabel(stage)}</h2>
              <span className={styles.count}>{column.length}</span>
            </header>
            {column.length === 0 ? (
              <p className={styles.empty}>Aucun OF</p>
            ) : (
              <ul className={styles.cards}>
                {column.map((o) => {
                  const prev = previousStage(o.stage);
                  const next = nextStage(o.stage);
                  const late = o.status !== 'done' && o.dueDate < today;
                  return (
                    <li
                      key={o.id}
                      className={cx(styles.card, o.status === 'blocked' && styles.blocked, o.status === 'done' && styles.done)}
                    >
                      <div className={styles.cardHead}>
                        <strong>{o.reference}</strong>
                        <Badge tone={PRODUCTION_STATUS[o.status].tone}>{PRODUCTION_STATUS[o.status].label}</Badge>
                      </div>
                      <p className={styles.ref}>
                        {o.harnessRef} · {lookups.lineById.get(o.lineId)?.name}
                      </p>
                      {o.status === 'blocked' && o.blockedReason && <p className={styles.reason}>{o.blockedReason}</p>}
                      <div className={styles.qty}>
                        <Progress
                          value={o.quantityDone}
                          max={o.quantityPlanned}
                          label={`Avancement ${o.reference}`}
                          tone={o.status === 'done' ? 'success' : 'info'}
                          size="sm"
                        />
                        <span>
                          {o.quantityDone}/{o.quantityPlanned}
                        </span>
                      </div>
                      <p className={cx(styles.meta, late && styles.late)}>
                        Échéance {o.dueDate === today ? 'aujourd’hui' : formatDate(o.dueDate)}
                        {late ? ' · en retard' : ''}
                        {o.ownerId ? ` · ${lookups.userName(o.ownerId)}` : ''}
                      </p>
                      {editable && o.status !== 'done' && (
                        <div className={styles.cardActions}>
                          <IconButton
                            variant="secondary"
                            label={prev ? `Revenir à ${stageLabel(prev)}` : 'Première étape'}
                            icon={<ChevronLeft size={16} />}
                            disabled={!prev}
                            onClick={() => prev && onMove(o, prev)}
                          />
                          <IconButton
                            variant="secondary"
                            label={next ? `Passer à ${stageLabel(next)}` : 'Dernière étape'}
                            icon={<ChevronRight size={16} />}
                            disabled={!next || o.status === 'blocked'}
                            onClick={() => next && onMove(o, next)}
                          />
                          <Menu
                            items={[
                              { label: 'Saisir la quantité produite', onSelect: () => onQuantity(o) },
                              o.status === 'blocked'
                                ? { label: 'Débloquer', onSelect: () => onUnblock(o) }
                                : { label: 'Signaler un blocage', onSelect: () => onBlock(o) },
                              { label: 'Marquer terminé', onSelect: () => onComplete(o) },
                            ]}
                            trigger={(props) => (
                              <button type="button" className={styles.more} {...props}>
                                Plus…
                              </button>
                            )}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
