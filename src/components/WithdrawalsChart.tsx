import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { DAY_MS } from '../engine/timeline';
import { MARGIN, roundedStep, TICK_ROOM, timeTicks } from './chartAxis';
import { foldedSources, stackOf, type Band, type Place, type Source, type Stack } from './flowsLayout';
import { compactFormat, moneyFormat } from './formats';

const HEIGHT = 360;
const TOOLTIP_WIDTH = 216;
// Less than this a month is rounding, not something to list.
const LISTED_AMOUNT = 1;

interface Labels {
  other: string;
  need: string;
  surplus: string;
  // Says where what is left over goes.
  surplusGoesOn: string;
  short: string;
  tax: string;
  wealthTax: string;
}

// In kroner a month, with one value for each year.
interface Amounts {
  need: ArrayLike<number>;
  surplus: ArrayLike<number>;
  short: ArrayLike<number>;
  tax: ArrayLike<number>;
  // Lies in the same layer as the tax, and has its own row when hovering.
  wealthTax: ArrayLike<number>;
}

interface Props extends Amounts {
  title: string;
  labels: Labels;
  // Where each calendar year begins, and last where the final one ends. The series have one value for each year.
  yearEdges: ArrayLike<number>;
  sources: Source[];
  yMax: number;
  startMs: number;
  totalDays: number;
  birthYear: number | null;
  locale: string;
  currency: string;
  ageLabel: (age: number) => string;
}

// The ids of the two hatchings, for the chart and for the swatches that show them.
interface Patterns {
  surplus: string;
  short: string;
}

const Swatch = ({ kind }: { kind: string }) => <span className={`flows-swatch ${kind}`} aria-hidden="true" />;

// Drawn with the chart's own pattern, so what the legend shows is what the chart shows, stripes and all.
const PatternSwatch = ({ pattern }: { pattern: string }) => (
  <svg className="flows-swatch flows-swatch-pattern" aria-hidden="true">
    <rect width="100%" height="100%" fill={`url(#${pattern})`} />
  </svg>
);

// A name in the middle of its band. Over the hatching it is muted, and over the stripes it takes their colour.
function BandName({ place, name, tone }: { place: Place; name: string; tone?: 'muted' | 'short' }) {
  return (
    <text
      className={tone ? `flows-name flows-name-${tone}` : 'flows-name'}
      x={place.x}
      y={place.y}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {name}
    </text>
  );
}

// One line in the tooltip: what it is, and how much a month.
function FlowsRow({ swatch, name, amount, total = false }: { swatch?: ReactNode; name: string; amount: string; total?: boolean }) {
  return (
    <span className={total ? 'flows-row flows-row-total' : 'flows-row'}>
      {swatch}
      <span className="flows-row-name">{name}</span>
      <span>{amount}</span>
    </span>
  );
}

interface TooltipProps {
  year: number;
  heading: string;
  left: number;
  sources: Source[];
  amounts: Amounts;
  labels: Labels;
  money: Intl.NumberFormat;
  patterns: Patterns;
}

// The year under the pointer, from the top of the stack down, then the need and what is beyond it or missing.
function FlowsTooltip({ year, heading, left, sources, amounts, labels, money, patterns }: TooltipProps) {
  const { need, surplus, short, tax, wealthTax } = amounts;
  return (
    <div className="flows-tooltip" role="status" style={{ left, width: TOOLTIP_WIDTH }}>
      <strong>{heading}</strong>
      {[...sources]
        .reverse()
        .filter((source) => source.perMonth[year] > LISTED_AMOUNT)
        .map((source) => (
          <FlowsRow
            key={source.slot}
            swatch={<Swatch kind={`series-${source.slot + 1}`} />}
            name={source.name}
            amount={money.format(source.perMonth[year])}
          />
        ))}
      <FlowsRow total name={labels.need} amount={money.format(need[year])} />
      {surplus[year] > LISTED_AMOUNT && (
        <>
          <FlowsRow swatch={<PatternSwatch pattern={patterns.surplus} />} name={labels.surplus} amount={money.format(surplus[year])} />
          <span className="flows-row-note">{labels.surplusGoesOn}</span>
        </>
      )}
      {short[year] > LISTED_AMOUNT && (
        <FlowsRow swatch={<PatternSwatch pattern={patterns.short} />} name={labels.short} amount={money.format(short[year])} />
      )}
      {tax[year] > LISTED_AMOUNT && (
        <FlowsRow swatch={<Swatch kind="flows-swatch-tax" />} name={labels.tax} amount={money.format(tax[year])} />
      )}
      {wealthTax[year] > LISTED_AMOUNT && (
        <FlowsRow swatch={<Swatch kind="flows-swatch-tax" />} name={labels.wealthTax} amount={money.format(wealthTax[year])} />
      )}
    </div>
  );
}

const unplaced = (band: Band | null) => band !== null && band.place === null;

// What has no name in the chart, because it fits nowhere there. Nothing at all when every name fits.
function FlowsLegend({ stack, labels, patterns }: { stack: Stack; labels: Labels; patterns: Patterns }) {
  const layers = stack.layers.filter((layer) => !layer.place);
  if (layers.length === 0 && !unplaced(stack.surplus) && !unplaced(stack.short) && !unplaced(stack.tax)) return null;
  return (
    <ul className="flows-legend">
      {layers.map((layer) => (
        <li key={layer.slot}>
          <Swatch kind={`series-${layer.slot + 1}`} />
          {layer.name}
        </li>
      ))}
      {unplaced(stack.surplus) && (
        <li>
          <PatternSwatch pattern={patterns.surplus} />
          {labels.surplus}
        </li>
      )}
      {unplaced(stack.short) && (
        <li>
          <PatternSwatch pattern={patterns.short} />
          {labels.short}
        </li>
      )}
      {unplaced(stack.tax) && (
        <li>
          <Swatch kind="flows-swatch-tax" />
          {labels.tax}
        </li>
      )}
    </ul>
  );
}

// Stacked areas of what pays each year after tax, with a line for the need. What goes beyond the need is grey with a faint
// hatching, and what is missing up to it has broad stripes in a warm colour, so neither can be taken for ordinary money or
// for the other. The tax lies on top of it all, so the whole height is what has to be found.
export default function WithdrawalsChart({
  title,
  labels,
  yearEdges,
  sources,
  need,
  surplus,
  short,
  tax,
  wealthTax,
  yMax,
  startMs,
  totalDays,
  birthYear,
  locale,
  currency,
  ageLabel,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  // Two charts on one page must not share a pattern, and an id in url() takes no special characters.
  const id = useId().replace(/\W/g, '');

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(box.current!);
    return () => observer.disconnect();
  }, []);

  const shown = foldedSources(sources, labels.other);
  const years = need.length;
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const dayToX = (day: number) => MARGIN.left + (day / totalDays) * plotWidth;
  const toY = (value: number) => MARGIN.top + plotHeight * (1 - value / yMax);
  const edges = Array.from(yearEdges, dayToX);

  const compact = compactFormat(locale);
  const money = moneyFormat(locale, currency);
  const tickText = (tick: number) => (birthYear === null ? String(tick) : ageLabel(tick));
  const yearText = (year: number) => {
    const calendarYear = new Date(startMs + ((yearEdges[year] + yearEdges[year + 1]) / 2) * DAY_MS).getUTCFullYear();
    return tickText(birthYear === null ? calendarYear : calendarYear - birthYear);
  };

  const yStep = roundedStep(yMax);
  const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, index) => index * yStep);

  const stack = stackOf({ sources: shown, need, tax, wealthTax }, { edges, toY, yMax, plotHeight }, labels);
  const needLabel = stack.need ? `${labels.need} ${money.format(Math.max(...Array.from(need)))}` : '';

  function hover(event: PointerEvent<SVGSVGElement>) {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const year = edges.findIndex((edge) => edge > x) - 1;
    setHovered(year >= 0 ? year : x < edges[0] ? 0 : years - 1);
  }

  const peaks = shown.map((source) => `${source.name}: ${money.format(Math.max(...Array.from(source.perMonth)))}`).join(', ');
  const patterns: Patterns = { surplus: `${id}-surplus`, short: `${id}-short` };

  return (
    <figure className="flows">
      <figcaption className="flows-title">{title}</figcaption>
      <div ref={box} className="flows-plot">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${title}. ${needLabel}. ${peaks}`}
            onPointerMove={hover}
            onPointerLeave={() => setHovered(null)}
          >
            <defs>
              {stack.layers.map((layer) => (
                <linearGradient
                  key={layer.slot}
                  id={`${id}-layer-${layer.slot}`}
                  className={`series-${layer.slot + 1}`}
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  x2="0"
                  y1={MARGIN.top}
                  y2={MARGIN.top + plotHeight}
                >
                  <stop className="flows-fade-top" offset="0" />
                  <stop className="flows-fade-bottom" offset="1" />
                </linearGradient>
              ))}
              <pattern id={patterns.surplus} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect className="flows-wash" width="6" height="6" />
                <line className="flows-hatch" x1="1" x2="1" y1="0" y2="6" />
              </pattern>
              <pattern id={patterns.short} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <rect className="flows-wash-short" width="8" height="8" />
                <line className="flows-hatch-short" x1="2" x2="2" y1="0" y2="8" />
              </pattern>
            </defs>
            {yTicks.map((value) => (
              <g key={value}>
                <line className="flows-grid" x1={MARGIN.left} x2={width - MARGIN.right} y1={toY(value)} y2={toY(value)} />
                <text className="flows-tick" x={MARGIN.left - 8} y={toY(value)} textAnchor="end" dominantBaseline="middle">
                  {compact.format(value)}
                </text>
              </g>
            ))}
            {timeTicks(startMs, totalDays, birthYear).map(({ day, tick }) => (
              <text
                key={tick}
                className="flows-tick"
                x={dayToX(day)}
                y={HEIGHT - 6}
                textAnchor={dayToX(day) > width - TICK_ROOM ? 'end' : 'middle'}
              >
                {tickText(tick)}
              </text>
            ))}
            <g className="flows-stack">
              {stack.layers.map((layer) => (
                <path key={layer.slot} className={`flows-layer series-${layer.slot + 1}`} fill={`url(#${id}-layer-${layer.slot})`} d={layer.area} />
              ))}
              {stack.layers.map((layer) => (
                <path key={layer.slot} className={`flows-edge series-${layer.slot + 1}`} d={layer.edge} />
              ))}
              {stack.surplus && <path className="flows-surplus" fill={`url(#${patterns.surplus})`} d={stack.surplus.area} />}
              {stack.short && <path className="flows-short" fill={`url(#${patterns.short})`} d={stack.short.area} />}
              {stack.tax && <path className="flows-tax" d={stack.tax.area} />}
              {stack.need && <path className="flows-need" d={stack.need.path} />}
            </g>
            {hovered !== null && (
              <rect
                className="flows-cursor"
                x={edges[hovered]}
                width={Math.max(1, edges[hovered + 1] - edges[hovered])}
                y={MARGIN.top}
                height={plotHeight}
              />
            )}
            {stack.layers.map((layer) => layer.place && <BandName key={layer.slot} place={layer.place} name={layer.name} />)}
            {stack.surplus?.place && <BandName place={stack.surplus.place} name={labels.surplus} tone="muted" />}
            {stack.short?.place && <BandName place={stack.short.place} name={labels.short} tone="short" />}
            {stack.tax?.place && <BandName place={stack.tax.place} name={labels.tax} />}
            {stack.need && (
              <text
                className="flows-need-label"
                x={stack.need.label.x}
                y={stack.need.label.y}
                textAnchor={stack.need.label.anchor}
                dominantBaseline="middle"
              >
                {needLabel}
              </text>
            )}
          </svg>
        )}
        {hovered !== null && (
          <FlowsTooltip
            year={hovered}
            heading={yearText(hovered)}
            left={Math.max(0, Math.min(edges[hovered + 1] + 8, width - TOOLTIP_WIDTH))}
            sources={shown}
            amounts={{ need, surplus, short, tax, wealthTax }}
            labels={labels}
            money={money}
            patterns={patterns}
          />
        )}
      </div>
      {/* Before the width is known no name fits, and there is no chart yet for the swatches to take their patterns from. */}
      {width > 0 && <FlowsLegend stack={stack} labels={labels} patterns={patterns} />}
    </figure>
  );
}
