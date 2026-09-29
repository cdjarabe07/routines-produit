import { useId, type ReactNode } from 'react';
import { cx } from '@/utils/cx';
import styles from './Charts.module.css';

/* Graphiques SVG sobres. Chaque graphique propose ses données sous forme de tableau
   (<details>) : alternative accessible et vérification des chiffres. */

export interface Point {
  label: string;
  value: number | null;
}

interface SeriesChartProps {
  title: string;
  data: Point[];
  /** Série de comparaison (période précédente), même longueur */
  compare?: Point[];
  format?: (v: number) => string;
  /** Ligne de référence (objectif, seuil) */
  reference?: { value: number; label: string };
  height?: number;
  max?: number;
  /** Bas de l'axe (courbes uniquement) ; 0 par défaut. Les valeurs inférieures sont écrêtées. */
  min?: number;
  unitLabel?: string;
}

const W = 640;

function scaleMax(values: number[], hint?: number) {
  const m = Math.max(hint ?? 0, ...values, 1);
  const mag = 10 ** Math.floor(Math.log10(m));
  return Math.ceil(m / mag) * mag;
}

function DataTableFallback({ title, data, compare, format }: Pick<SeriesChartProps, 'title' | 'data' | 'compare' | 'format'>) {
  const f = (v: number | null) => (v === null ? '—' : format ? format(v) : String(v));
  return (
    <details className={styles.details}>
      <summary>Voir les données</summary>
      <table className={styles.dataTable}>
        <caption className="visually-hidden">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Période</th>
            <th scope="col">Valeur</th>
            {compare && <th scope="col">Période précédente</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((p, i) => (
            <tr key={`${p.label}-${i}`}>
              <th scope="row">{p.label}</th>
              <td>{f(p.value)}</td>
              {compare && <td>{f(compare[i]?.value ?? null)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Frame({ title, children, legend }: { title: string; children: ReactNode; legend?: ReactNode }) {
  return (
    <figure className={styles.figure}>
      <figcaption className="visually-hidden">{title}</figcaption>
      {legend && <div className={styles.legend}>{legend}</div>}
      {children}
    </figure>
  );
}

function axisLabels(count: number) {
  const step = count > 10 ? Math.ceil(count / 7) : 1;
  return (i: number) => i % step === 0 || i === count - 1;
}

export function BarChart({ title, data, compare, format, reference, height = 180, max, unitLabel }: SeriesChartProps) {
  const top = scaleMax(
    data
      .concat(compare ?? [])
      .map((d) => d.value ?? 0)
      .concat(reference ? [reference.value] : []),
    max,
  );
  const padL = 36,
    padB = 22,
    padT = 8;
  const innerW = W - padL - 4;
  const innerH = height - padB - padT;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(3, slot * (compare ? 0.36 : 0.62));
  const y = (v: number) => padT + innerH - (v / top) * innerH;
  const showLabel = axisLabels(data.length);

  return (
    <Frame
      title={title}
      legend={
        compare ? (
          <>
            <span className={cx(styles.key, styles.keyMain)} />
            Période <span className={cx(styles.key, styles.keyCompare)} />
            Période précédente
          </>
        ) : undefined
      }
    >
      <svg viewBox={`0 0 ${W} ${height}`} className={styles.svg} role="img" aria-label={title}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(top * t)} y2={y(top * t)} className={styles.grid} />
            <text x={padL - 6} y={y(top * t) + 4} className={styles.axis} textAnchor="end">
              {format ? format(top * t) : Math.round(top * t)}
            </text>
          </g>
        ))}
        {reference && (
          <g>
            <line x1={padL} x2={W} y1={y(reference.value)} y2={y(reference.value)} className={styles.reference} />
            <text x={W - 2} y={y(reference.value) - 4} className={styles.referenceLabel} textAnchor="end">
              {reference.label}
            </text>
          </g>
        )}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - barW * (compare ? 2 : 1)) / 2;
          const c = compare?.[i];
          return (
            <g key={`${d.label}-${i}`}>
              {c && c.value !== null && (
                <rect x={x} y={y(c.value)} width={barW} height={Math.max(0, innerH + padT - y(c.value))} className={styles.barCompare} />
              )}
              {d.value !== null && (
                <rect
                  x={compare ? x + barW : x}
                  y={y(d.value)}
                  width={barW}
                  height={Math.max(0, innerH + padT - y(d.value))}
                  className={styles.bar}
                >
                  <title>{`${d.label} : ${format ? format(d.value) : d.value}${unitLabel ? ` ${unitLabel}` : ''}`}</title>
                </rect>
              )}
              {showLabel(i) && (
                <text x={padL + i * slot + slot / 2} y={height - 6} className={styles.axis} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <DataTableFallback title={title} data={data} compare={compare} format={format} />
    </Frame>
  );
}

export function LineChart({ title, data, compare, format, reference, height = 180, max, min = 0 }: SeriesChartProps) {
  const clipId = useId();
  const values = data
    .concat(compare ?? [])
    .map((d) => d.value)
    .filter((v): v is number => v !== null);
  const top = max ?? scaleMax(values.concat(reference ? [reference.value] : []));
  const bottom = min;
  const padL = 40,
    padB = 22,
    padT = 8;
  const innerW = W - padL - 8;
  const innerH = height - padB - padT;
  const x = (i: number) => padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - ((Math.max(v, bottom) - bottom) / (top - bottom || 1)) * innerH;
  const path = (pts: Point[]) =>
    pts.reduce(
      (acc, p, i) => (p.value === null ? acc : `${acc}${acc === '' || pts[i - 1]?.value === null ? 'M' : 'L'}${x(i)},${y(p.value)} `),
      '',
    );
  const showLabel = axisLabels(data.length);

  return (
    <Frame
      title={title}
      legend={
        compare ? (
          <>
            <span className={cx(styles.key, styles.keyMain)} />
            Période <span className={cx(styles.key, styles.keyCompare)} />
            Période précédente
          </>
        ) : undefined
      }
    >
      <svg viewBox={`0 0 ${W} ${height}`} className={styles.svg} role="img" aria-label={title}>
        <clipPath id={clipId}>
          <rect x={padL} y={0} width={innerW + 8} height={height} />
        </clipPath>
        {[0, 0.5, 1].map((t) => {
          const v = bottom + (top - bottom) * t;
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className={styles.grid} />
              <text x={padL - 6} y={y(v) + 4} className={styles.axis} textAnchor="end">
                {format ? format(v) : Math.round(v)}
              </text>
            </g>
          );
        })}
        {reference && (
          <g>
            <line x1={padL} x2={W} y1={y(reference.value)} y2={y(reference.value)} className={styles.reference} />
            <text x={W - 2} y={y(reference.value) - 4} className={styles.referenceLabel} textAnchor="end">
              {reference.label}
            </text>
          </g>
        )}
        <g clipPath={`url(#${clipId})`}>
          {compare && <path d={path(compare)} className={styles.lineCompare} />}
          <path d={path(data)} className={styles.line} />
          {data.map((p, i) =>
            p.value === null ? null : (
              <circle key={i} cx={x(i)} cy={y(p.value)} r={data.length > 20 ? 2 : 3} className={styles.dot}>
                <title>{`${p.label} : ${format ? format(p.value) : p.value}`}</title>
              </circle>
            ),
          )}
        </g>
        {data.map((p, i) =>
          showLabel(i) ? (
            <text key={`l${i}`} x={x(i)} y={height - 6} className={styles.axis} textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
      <DataTableFallback title={title} data={data} compare={compare} format={format} />
    </Frame>
  );
}

/** Barres horizontales triées (pareto, répartition par catégorie). */
export function RankedBars({
  title,
  items,
  format,
  tone = 'info',
}: {
  title: string;
  items: { label: string; value: number; hint?: string }[];
  format?: (v: number) => string;
  tone?: 'info' | 'danger' | 'warning' | 'neutral';
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <figure className={styles.figure}>
      <figcaption className="visually-hidden">{title}</figcaption>
      <ul className={styles.ranked}>
        {items.map((item) => (
          <li key={item.label} className={styles.rankedRow}>
            <span className={styles.rankedLabel} title={item.hint}>
              {item.label}
            </span>
            <span className={styles.rankedTrack} aria-hidden>
              <span className={cx(styles.rankedBar, styles[`tone-${tone}`])} style={{ width: `${(item.value / max) * 100}%` }} />
            </span>
            <span className={styles.rankedValue}>
              {format ? format(item.value) : item.value}
              {total > 0 && <span className={styles.rankedShare}> · {Math.round((item.value / total) * 100)} %</span>}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
