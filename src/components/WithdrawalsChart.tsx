import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { DAY_MS } from '../engine/timeline';
import { MARGIN, roundedStep, timeTicks } from './chartAxis';

const HEIGHT = 360;
const LAST_SLOT = 7;
const TICK_ROOM = 20;
const TOOLTIP_WIDTH = 216;
// Half the width of the step between two years. It is short, so a stop does not look like a slow decline.
const STEP_HALF_WIDTH = 5;
const STEP_PARTS = 6;
const LABEL_HEIGHT = 20;
const LABEL_CHARACTER_WIDTH = 7;
const LABEL_PADDING = 10;
const NEED_LABEL_ROOM = 120;
const MIN_EDGE_HEIGHT = 0.25;
// Less than this a month is rounding, not something to list.
const LISTED_AMOUNT = 1;
// A band thinner than this cannot be seen, so it is not explained either.
const VISIBLE_HEIGHT = 1;

interface Source {
  name: string;
  // The place among the boxes wired in, so a box keeps its colour when another one stops paying.
  slot: number;
  perMonth: ArrayLike<number>;
}

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

interface Props {
  title: string;
  labels: Labels;
  // Where each calendar year begins, and last where the final one ends. The series have one value for each year.
  yearEdges: ArrayLike<number>;
  sources: Source[];
  need: ArrayLike<number>;
  surplus: ArrayLike<number>;
  short: ArrayLike<number>;
  tax: ArrayLike<number>;
  // Lies in the same layer as the tax, and has its own row when hovering.
  wealthTax: ArrayLike<number>;
  yMax: number;
  startMs: number;
  totalDays: number;
  birthYear: number | null;
  locale: string;
  currency: string;
  ageLabel: (age: number) => string;
}

type Point = [number, number];

// There are eight colours, and a ninth box does not get a colour of its own. The rest are added up.
function foldedSources(sources: Source[], other: string): Source[] {
  const rest = sources.filter((source) => source.slot >= LAST_SLOT);
  if (rest.length < 2) return sources;
  const perMonth = Array.from(rest[0].perMonth, (_, year) => rest.reduce((sum, source) => sum + source.perMonth[year], 0));
  return [...sources.filter((source) => source.slot < LAST_SLOT), { name: other, slot: LAST_SLOT, perMonth }];
}

const smoothStep = (part: number) => part * part * (3 - 2 * part);

// Flat through each calendar year, with a short and soft step to the next. Every outline has its points at the same
// places, so one stacked on another stays on top of it the whole way and the two can be compared point by point.
function outline(values: ArrayLike<number>, edges: number[], toY: (value: number) => number): Point[] {
  const points: Point[] = [[edges[0], toY(values[0])]];
  for (let year = 1; year < values.length; year++) {
    const [before, now] = [values[year - 1], values[year]];
    const half = Math.min(STEP_HALF_WIDTH, (edges[year] - edges[year - 1]) / 2, (edges[year + 1] - edges[year]) / 2);
    for (let part = 0; part <= STEP_PARTS; part++) {
      const share = part / STEP_PARTS;
      points.push([edges[year] - half + 2 * half * share, toY(before + (now - before) * smoothStep(share))]);
    }
  }
  points.push([edges[values.length], toY(values[values.length - 1])]);
  return points;
}

const pathOf = (points: Point[]) => points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
const areaOf = (upper: Point[], lower: Point[]) => `${pathOf([...upper, ...[...lower].reverse()])}Z`;

// The line along the top of a layer, only where it has any height, so a box that is not paying draws nothing.
function edgeOf(upper: Point[], lower: Point[]): string {
  const hasHeight = (index: number) => index >= 0 && index < upper.length && lower[index][1] - upper[index][1] > MIN_EDGE_HEIGHT;
  let path = '';
  let drawing = false;
  upper.forEach(([x, y], index) => {
    if (!hasHeight(index - 1) && !hasHeight(index) && !hasHeight(index + 1)) {
      drawing = false;
      return;
    }
    path += `${drawing ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    drawing = true;
  });
  return path;
}

// A name goes where the band is widest and still tall enough for it. Null when it fits nowhere, and then the legend has it.
function placeInBand(name: string, upper: number[], lower: number[], edges: number[]): { x: number; y: number } | null {
  const wanted = name.length * LABEL_CHARACTER_WIDTH + LABEL_PADDING;
  let best: { width: number; x: number; y: number } | null = null;
  for (let from = 0; from < upper.length; from++) {
    let [top, bottom] = [-Infinity, Infinity];
    for (let to = from; to < upper.length; to++) {
      // Screen coordinates, so the top of a band is its smallest number.
      top = Math.max(top, upper[to]);
      bottom = Math.min(bottom, lower[to]);
      if (bottom - top < LABEL_HEIGHT) break;
      const width = edges[to + 1] - edges[from];
      if (width >= wanted && (!best || width > best.width)) {
        best = { width, x: (edges[from] + edges[to + 1]) / 2, y: (top + bottom) / 2 };
      }
    }
  }
  return best && { x: best.x, y: best.y };
}

// Drawn with the chart's own pattern, so what the legend shows is what the chart shows, stripes and all.
const PatternSwatch = ({ pattern }: { pattern: string }) => (
  <svg className="flows-swatch flows-swatch-pattern" aria-hidden="true">
    <rect width="100%" height="100%" fill={`url(#${pattern})`} />
  </svg>
);

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

  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  const tickText = (tick: number) => (birthYear === null ? String(tick) : ageLabel(tick));
  const yearText = (year: number) => {
    const calendarYear = new Date(startMs + ((yearEdges[year] + yearEdges[year + 1]) / 2) * DAY_MS).getUTCFullYear();
    return tickText(birthYear === null ? calendarYear : calendarYear - birthYear);
  };

  const yStep = roundedStep(yMax);
  const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, index) => index * yStep);

  // Each source starts where the one below it ends.
  const tops: number[][] = [];
  shown.forEach((source, layer) => {
    tops.push(Array.from(source.perMonth, (value, year) => value + (layer > 0 ? tops[layer - 1][year] : 0)));
  });
  const nothing = Array.from({ length: years }, () => 0);
  const paid = tops.at(-1) ?? nothing;
  const needs = Array.from(need);
  const aboveNeed = paid.map((value, year) => Math.max(value, needs[year]));
  const belowNeed = paid.map((value, year) => Math.min(value, needs[year]));
  const withTax = aboveNeed.map((value, year) => value + tax[year] + wealthTax[year]);
  const isVisible = (amount: number) => (amount / yMax) * plotHeight >= VISIBLE_HEIGHT;
  const hasSurplus = aboveNeed.some((value, year) => isVisible(value - needs[year]));
  const hasShort = belowNeed.some((value, year) => isVisible(needs[year] - value));
  const hasTax = withTax.some((value, year) => isVisible(value - aboveNeed[year]));
  const upToNeed = (values: number[]) => values.map((value, year) => toY(Math.min(value, needs[year])));

  const layers = shown.map((source, layer) => {
    const lower = layer > 0 ? tops[layer - 1] : nothing;
    const capped = (values: number[]) => outline(values.map((value, year) => Math.min(value, needs[year])), edges, toY);
    return {
      ...source,
      area: areaOf(outline(tops[layer], edges, toY), outline(lower, edges, toY)),
      // What goes beyond the need is greyed out, so only what is under it gets a line in its colour.
      edge: edgeOf(capped(tops[layer]), capped(lower)),
      // Under the need if there is room, where it has the colour to itself and not the hatching.
      place:
        placeInBand(source.name, upToNeed(tops[layer]), upToNeed(lower), edges) ??
        placeInBand(source.name, tops[layer].map(toY), lower.map(toY), edges),
    };
  });
  const needAt = needs.findIndex((value) => value > 0);
  const needPath = needAt < 0 ? '' : pathOf(outline(needs.slice(needAt), edges.slice(needAt), toY));
  const needLabel = needAt < 0 ? '' : `${labels.need} ${money.format(Math.max(...needs))}`;
  const surplusPlace = hasSurplus ? placeInBand(labels.surplus, aboveNeed.map(toY), needs.map(toY), edges) : null;
  const shortPlace = hasShort ? placeInBand(labels.short, needs.map(toY), belowNeed.map(toY), edges) : null;
  const taxPlace = hasTax ? placeInBand(labels.tax, withTax.map(toY), aboveNeed.map(toY), edges) : null;

  const unplaced = layers.filter((layer) => !layer.place);
  const inLegend = unplaced.length > 0 || (hasSurplus && !surplusPlace) || (hasShort && !shortPlace) || (hasTax && !taxPlace);

  function hover(event: PointerEvent<SVGSVGElement>) {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const year = edges.findIndex((edge) => edge > x) - 1;
    setHovered(year >= 0 ? year : x < edges[0] ? 0 : years - 1);
  }

  const peaks = shown.map((source) => `${source.name}: ${money.format(Math.max(...Array.from(source.perMonth)))}`).join(', ');
  const hatchSurplus = `${id}-surplus`;
  const hatchShort = `${id}-short`;

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
              {layers.map((layer) => (
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
              <pattern id={hatchSurplus} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect className="flows-wash" width="6" height="6" />
                <line className="flows-hatch" x1="1" x2="1" y1="0" y2="6" />
              </pattern>
              <pattern id={hatchShort} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
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
              {layers.map((layer) => (
                <path key={layer.slot} className={`flows-layer series-${layer.slot + 1}`} fill={`url(#${id}-layer-${layer.slot})`} d={layer.area} />
              ))}
              {layers.map((layer) => (
                <path key={layer.slot} className={`flows-edge series-${layer.slot + 1}`} d={layer.edge} />
              ))}
              {hasSurplus && (
                <path
                  className="flows-surplus"
                  fill={`url(#${hatchSurplus})`}
                  d={areaOf(outline(aboveNeed, edges, toY), outline(needs, edges, toY))}
                />
              )}
              {hasShort && (
                <path
                  className="flows-short"
                  fill={`url(#${hatchShort})`}
                  d={areaOf(outline(needs, edges, toY), outline(belowNeed, edges, toY))}
                />
              )}
              {hasTax && <path className="flows-tax" d={areaOf(outline(withTax, edges, toY), outline(aboveNeed, edges, toY))} />}
              {needPath && <path className="flows-need" d={needPath} />}
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
            {layers.map(
              (layer) =>
                layer.place && (
                  <text key={layer.slot} className="flows-name" x={layer.place.x} y={layer.place.y} textAnchor="middle" dominantBaseline="middle">
                    {layer.name}
                  </text>
                ),
            )}
            {surplusPlace && (
              <text className="flows-name flows-name-muted" x={surplusPlace.x} y={surplusPlace.y} textAnchor="middle" dominantBaseline="middle">
                {labels.surplus}
              </text>
            )}
            {shortPlace && (
              <text className="flows-name flows-name-short" x={shortPlace.x} y={shortPlace.y} textAnchor="middle" dominantBaseline="middle">
                {labels.short}
              </text>
            )}
            {taxPlace && (
              <text className="flows-name" x={taxPlace.x} y={taxPlace.y} textAnchor="middle" dominantBaseline="middle">
                {labels.tax}
              </text>
            )}
            {needPath && (
              <text
                className="flows-need-label"
                x={edges[needAt] - MARGIN.left > NEED_LABEL_ROOM ? edges[needAt] - 8 : edges[needAt] + 8}
                y={edges[needAt] - MARGIN.left > NEED_LABEL_ROOM ? toY(Math.max(...needs)) : toY(Math.max(...needs)) - 9}
                textAnchor={edges[needAt] - MARGIN.left > NEED_LABEL_ROOM ? 'end' : 'start'}
                dominantBaseline="middle"
              >
                {needLabel}
              </text>
            )}
          </svg>
        )}
        {hovered !== null && (
          <div
            className="flows-tooltip"
            role="status"
            style={{ left: Math.max(0, Math.min(edges[hovered + 1] + 8, width - TOOLTIP_WIDTH)), width: TOOLTIP_WIDTH }}
          >
            <strong>{yearText(hovered)}</strong>
            {[...shown]
              .reverse()
              .filter((source) => source.perMonth[hovered] > LISTED_AMOUNT)
              .map((source) => (
                <span key={source.slot} className="flows-row">
                  <span className={`flows-swatch series-${source.slot + 1}`} aria-hidden="true" />
                  <span className="flows-row-name">{source.name}</span>
                  <span>{money.format(source.perMonth[hovered])}</span>
                </span>
              ))}
            <span className="flows-row flows-row-total">
              <span className="flows-row-name">{labels.need}</span>
              <span>{money.format(need[hovered])}</span>
            </span>
            {surplus[hovered] > LISTED_AMOUNT && (
              <>
                <span className="flows-row">
                  <PatternSwatch pattern={hatchSurplus} />
                  <span className="flows-row-name">{labels.surplus}</span>
                  <span>{money.format(surplus[hovered])}</span>
                </span>
                <span className="flows-row-note">{labels.surplusGoesOn}</span>
              </>
            )}
            {short[hovered] > LISTED_AMOUNT && (
              <span className="flows-row">
                <PatternSwatch pattern={hatchShort} />
                <span className="flows-row-name">{labels.short}</span>
                <span>{money.format(short[hovered])}</span>
              </span>
            )}
            {tax[hovered] > LISTED_AMOUNT && (
              <span className="flows-row">
                <span className="flows-swatch flows-swatch-tax" aria-hidden="true" />
                <span className="flows-row-name">{labels.tax}</span>
                <span>{money.format(tax[hovered])}</span>
              </span>
            )}
            {wealthTax[hovered] > LISTED_AMOUNT && (
              <span className="flows-row">
                <span className="flows-swatch flows-swatch-tax" aria-hidden="true" />
                <span className="flows-row-name">{labels.wealthTax}</span>
                <span>{money.format(wealthTax[hovered])}</span>
              </span>
            )}
          </div>
        )}
      </div>
      {/* Before the width is known no name fits, and there is no chart yet for the swatches to take their patterns from. */}
      {width > 0 && inLegend && (
        <ul className="flows-legend">
          {unplaced.map((layer) => (
            <li key={layer.slot}>
              <span className={`flows-swatch series-${layer.slot + 1}`} aria-hidden="true" />
              {layer.name}
            </li>
          ))}
          {hasSurplus && !surplusPlace && (
            <li>
              <PatternSwatch pattern={hatchSurplus} />
              {labels.surplus}
            </li>
          )}
          {hasShort && !shortPlace && (
            <li>
              <PatternSwatch pattern={hatchShort} />
              {labels.short}
            </li>
          )}
          {hasTax && !taxPlace && (
            <li>
              <span className="flows-swatch flows-swatch-tax" aria-hidden="true" />
              {labels.tax}
            </li>
          )}
        </ul>
      )}
    </figure>
  );
}
