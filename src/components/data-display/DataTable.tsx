import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { EmptyState } from '@/components/feedback/States';
import { Button } from '@/components/ui/Button';
import { useIsTabletOrSmaller } from '@/hooks/useMediaQuery';
import { cx } from '@/utils/cx';
import { normalize } from '@/utils/format';
import styles from './DataTable.module.css';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Active le tri sur cette colonne */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  width?: string;
  /** Rôle dans la vue carte (mobile). « hidden » masque la colonne sur mobile. */
  mobile?: 'title' | 'aside' | 'meta' | 'hidden';
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Titre accessible du tableau */
  caption: string;
  /** Lien de la ligne : la colonne titre devient un lien, la ligne entière est cliquable */
  rowLink?: (row: T) => string;
  search?: { placeholder: string; text: (row: T) => string };
  initialSort?: { id: string; direction: 'asc' | 'desc' };
  pageSize?: number;
  empty: { title: string; description?: ReactNode; action?: ReactNode };
  toolbar?: ReactNode;
  rowTone?: (row: T) => 'danger' | 'warning' | undefined;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  rowLink,
  search,
  initialSort,
  pageSize = 25,
  empty,
  toolbar,
  rowTone,
}: DataTableProps<T>) {
  const compact = useIsTabletOrSmaller();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search || !query.trim()) return rows;
    const q = normalize(query.trim());
    return rows.filter((r) => normalize(search.text(r)).includes(q));
  }, [rows, search, query]);

  const sorted = useMemo(() => {
    const col = sort && columns.find((c) => c.id === sort.id);
    if (!sort || !col?.sortValue) return filtered;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'fr')) * factor;
    });
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id === id ? { id, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { id, direction: 'asc' }));

  const titleCol = columns.find((c) => c.mobile === 'title') ?? columns[0]!;
  const renderTitle = (row: T) =>
    rowLink ? (
      <Link to={rowLink(row)} className={styles.rowLink} onClick={(e) => e.stopPropagation()}>
        {titleCol.cell(row)}
      </Link>
    ) : (
      titleCol.cell(row)
    );

  return (
    <div className={styles.wrap}>
      {(search || toolbar) && (
        <div className={styles.toolbar}>
          {search && (
            <label className={styles.search}>
              <Search size={16} aria-hidden className={styles.searchIcon} />
              <span className="visually-hidden">Rechercher</span>
              <input
                type="search"
                value={query}
                placeholder={search.placeholder}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
          )}
          {toolbar}
        </div>
      )}

      {visible.length === 0 ? (
        query ? (
          <EmptyState
            compact
            title={`Aucun résultat pour « ${query} ».`}
            action={
              <Button size="sm" variant="ghost" onClick={() => setQuery('')}>
                Effacer la recherche
              </Button>
            }
          />
        ) : (
          <EmptyState compact title={empty.title} description={empty.description} action={empty.action} />
        )
      ) : compact ? (
        <ul className={styles.cards} aria-label={caption}>
          {visible.map((row) => {
            const aside = columns.filter((c) => c.mobile === 'aside');
            const meta = columns.filter((c) => c !== titleCol && (c.mobile === 'meta' || c.mobile === undefined));
            return (
              <li key={rowKey(row)} className={cx(styles.card, rowTone?.(row) && styles[rowTone(row)!])}>
                <div className={styles.cardHead}>
                  <div className={styles.cardTitle}>{renderTitle(row)}</div>
                  {aside.map((c) => (
                    <div key={c.id}>{c.cell(row)}</div>
                  ))}
                </div>
                {meta.length > 0 && (
                  <dl className={styles.cardMeta}>
                    {meta.map((c) => (
                      <div key={c.id}>
                        <dt>{c.header}</dt>
                        <dd>{c.cell(row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table}>
            <caption className="visually-hidden">{caption}</caption>
            <thead>
              <tr>
                {columns.map((c) => {
                  const active = sort?.id === c.id;
                  return (
                    <th
                      key={c.id}
                      scope="col"
                      style={{ width: c.width, textAlign: c.align }}
                      aria-sort={active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {c.sortValue ? (
                        <button type="button" className={styles.sortButton} onClick={() => toggleSort(c.id)}>
                          {c.header}
                          {active ? (
                            sort!.direction === 'asc' ? (
                              <ArrowUp size={13} aria-hidden />
                            ) : (
                              <ArrowDown size={13} aria-hidden />
                            )
                          ) : (
                            <ArrowUpDown size={13} aria-hidden className={styles.sortIdle} />
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={cx(rowLink && styles.clickable, rowTone?.(row) && styles[rowTone(row)!])}
                  onClick={rowLink ? () => navigate(rowLink(row)) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.id} style={{ textAlign: c.align }}>
                      {c === titleCol ? renderTitle(row) : c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className={styles.pager} aria-label="Pagination">
          <span>
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} sur {sorted.length}
          </span>
          <div className={styles.pagerButtons}>
            <Button size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Précédent
            </Button>
            <Button size="sm" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
              Suivant
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
