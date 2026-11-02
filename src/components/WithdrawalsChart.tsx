import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { DAY_MS } from '../engine/timeline';
import { MARGIN, roundedStep, timeTicks } from './chartAxis';

const HEIGHT = 224;
const LAST_SLOT = 7;
const MAX_DIRECT_LABELS = 4;
const LABEL_HEIGHT = 17;
const TOP_LABEL_Y = 12;
const TICK_ROOM = 20;
const TOOLTIP_WIDTH = 180;

interface Line {
  name: string;
  // The place among the boxes wired in, so a box keeps its colour when another one stops paying.
  slot: number;
  perMonth: Float64Array;
}

interface Props {
  title: string;
  otherLabel: string;
  days: Float64Array;
  lines: Line[];
  yMax: number;
  startMs: number;
  totalDays: number;
  birthYear: number | null;
  locale: string;
  currency: string;
  ageLabel: (age: number) => string;
}

// There are eight colours, and a ninth box does not get a colour of its own. The rest are added up.
function foldedLines(lines: Line[], otherLabel: string): Line[] {
  const rest = lines.filter((line) => line.slot >= LAST_SLOT);
  if (rest.length < 2) return lines;
  const perMonth = rest[0].perMonth.map((_, year) => rest.reduce((sum, line) => sum + line.perMonth[year], 0));
  return [...lines.filter((line) => line.slot < LAST_SLOT), { name: otherLabel, slot: LAST_SLOT, perMonth }];
}

// A line only exists while the box pays, so boxes that are not paying do not pile up along the bottom.
function pathOf(line: Line, toX: (year: number) => number, toY: (value: number) => number): string {
  const paying = (year: number) => line.perMonth[year] > 0;
  let path = '';
  let drawing = false;
  for (let year = 0; year < line.perMonth.length; year++) {
    if (!paying(year) && !paying(year - 1) && !paying(year + 1)) {
      drawing = false;
      continue;
    }
    path += `${drawing ? 'L' : 'M'}${toX(year).toFixed(1)} ${toY(line.perMonth[year]).toFixed(1)}`;
    drawing = true;
  }
  return path;
}

// Each name sits where its line stops paying, moved down where it would land on another name.
function directLabels(lines: Line[], toX: (year: number) => number, toY: (value: number) => number) {
  const labels = lines
    .map((line) => {
      const year = line.perMonth.length - 1 - [...line.perMonth].reverse().findIndex((value) => value > 0);
      return { ...line, x: toX(year), y: toY(line.perMonth[year]) - 6 };
    })
    .sort((a, b) => a.y - b.y);
  let lowestSoFar = TOP_LABEL_Y - LABEL_HEIGHT;
  for (const label of labels) {
    label.y = Math.max(label.y, lowestSoFar + LABEL_HEIGHT);
    lowestSoFar = label.y;
  }
  return labels;
}

export default function WithdrawalsChart({
  title,
  otherLabel,
  days,
  lines,
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

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(box.current!);
    return () => observer.disconnect();
  }, []);

  const shown = foldedLines(lines, otherLabel);
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const dayToX = (day: number) => MARGIN.left + (day / totalDays) * plotWidth;
  const toX = (year: number) => dayToX(days[year]);
  const toY = (value: number) => MARGIN.top + plotHeight * (1 - value / yMax);

  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  const tickText = (tick: number) => (birthYear === null ? String(tick) : ageLabel(tick));
  const yearText = (year: number) => {
    const calendarYear = new Date(startMs + days[year] * DAY_MS).getUTCFullYear();
    return tickText(birthYear === null ? calendarYear : calendarYear - birthYear);
  };

  const yStep = roundedStep(yMax);
  const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, index) => index * yStep);

  function hover(event: PointerEvent<SVGSVGElement>) {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const distances = Array.from(days, (day) => Math.abs(dayToX(day) - x));
    setHovered(distances.indexOf(Math.min(...distances)));
  }

  const peaks = shown.map((line) => `${line.name}: ${money.format(Math.max(...line.perMonth))}`).join(', ');

  return (
    <figure className="flows">
      <figcaption className="flows-title">{shown.length === 1 ? `${title}: ${shown[0].name}` : title}</figcaption>
      {shown.length > 1 && (
        <ul className="flows-legend">
          {shown.map((line) => (
            <li key={line.slot}>
              <span className={`flows-swatch series-${line.slot + 1}`} aria-hidden="true" />
              {line.name}
            </li>
          ))}
        </ul>
      )}
      <div ref={box} className="flows-plot">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`${title}. ${peaks}`}
            onPointerMove={hover}
            onPointerLeave={() => setHovered(null)}
          >
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
            {hovered !== null && (
              <line className="flows-cursor" x1={toX(hovered)} x2={toX(hovered)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} />
            )}
            {shown.map((line) => (
              <path key={line.slot} className={`flows-line series-${line.slot + 1}`} d={pathOf(line, toX, toY)} />
            ))}
            {hovered !== null &&
              shown.map((line) => (
                <circle
                  key={line.slot}
                  className={`flows-dot series-${line.slot + 1}`}
                  cx={toX(hovered)}
                  cy={toY(line.perMonth[hovered])}
                  r={4}
                />
              ))}
            {shown.length > 1 &&
              shown.length <= MAX_DIRECT_LABELS &&
              directLabels(shown, toX, toY).map((label) => (
                <text
                  key={label.slot}
                  className="flows-label"
                  x={label.x}
                  y={label.y}
                  textAnchor={label.x - MARGIN.left < plotWidth / 2 ? 'start' : 'end'}
                >
                  {label.name}
                </text>
              ))}
          </svg>
        )}
        {hovered !== null && (
          <div
            className="flows-tooltip"
            role="status"
            style={{ left: Math.max(0, Math.min(toX(hovered) + 12, width - TOOLTIP_WIDTH)), width: TOOLTIP_WIDTH }}
          >
            <strong>{yearText(hovered)}</strong>
            {shown.map((line) => (
              <span key={line.slot} className="flows-row">
                <span className={`flows-swatch series-${line.slot + 1}`} aria-hidden="true" />
                <span className="flows-row-name">{line.name}</span>
                <span>{money.format(line.perMonth[hovered])}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
