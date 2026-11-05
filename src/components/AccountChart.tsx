import { useEffect, useRef } from 'react';
import { currentTheme } from '../theme';
import { followCanvas, tokensOf, type PlayedPasses, type RegisterDraw } from './canvas';
import { fillBand, MARGIN, roundedStep, TICK_ROOM, timeTicks, traceLine } from './chartAxis';
import { compactFormat } from './formats';

const DASHES = { deposits: [5, 4], shield: [1, 4] };
// The size of --text-xs in styles.css, written out since a canvas takes no rem.
const FONT = '12px "Hanken Grotesk Variable", system-ui, sans-serif';
// The inner band lies on top of the outer one, so it is stronger without being another colour.
const BAND_ALPHA = 0.22;

interface Props {
  player: PlayedPasses;
  index: number;
  locale: string;
  birthYear: number | null;
  ageLabel: (age: number) => string;
  description: string;
  registerDraw: RegisterDraw;
}

// A piece of one of the thin lines, for a legend. The dashes are the chart's own, and styles.css gives it the same colour.
export function LineSample({ line }: { line: keyof typeof DASHES }) {
  return (
    <svg viewBox="0 0 32 8" aria-hidden="true">
      <line className={`chart-sample chart-sample-${line}`} x1="0" x2="32" y1="4" y2="4" strokeDasharray={DASHES[line].join(' ')} />
    </svg>
  );
}

export default function AccountChart({ player, index, locale, birthYear, ageLabel, description, registerDraw }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const { startMs, totalDays, sampleDays } = player.layout;
    const compact = compactFormat(locale);
    const color = tokensOf(canvas);
    let paintedKey = '';

    function draw() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      // Nothing here moves, so it is only painted again when the numbers, the size or the colours are new.
      const key = `${width}x${height}:${ratio}:${currentTheme()}:${player.summary.passes}`;
      if (key === paintedKey) return;
      paintedKey = key;

      const { yMax, median, spread, deposits, shield } = player.summary.stocks[index];
      const plotWidth = width - MARGIN.left - MARGIN.right;
      const plotHeight = height - MARGIN.top - MARGIN.bottom;
      const toX = (day: number) => MARGIN.left + (day / totalDays) * plotWidth;
      const toY = (value: number) => MARGIN.top + plotHeight * (1 - value / yMax);
      const trace = (values: ArrayLike<number>) => traceLine(context, values, sampleDays, toX, toY);

      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = FONT;
      context.lineWidth = 1;
      context.strokeStyle = color('--line');
      context.fillStyle = color('--muted');

      const yStep = roundedStep(yMax);
      context.textAlign = 'right';
      context.textBaseline = 'middle';
      for (let value = 0; value <= yMax; value += yStep) {
        const y = Math.round(toY(value)) + 0.5;
        context.beginPath();
        context.moveTo(MARGIN.left, y);
        context.lineTo(width - MARGIN.right, y);
        context.stroke();
        context.fillText(compact.format(value), MARGIN.left - 8, y);
      }

      context.textBaseline = 'alphabetic';
      for (const { day, tick } of timeTicks(startMs, totalDays, birthYear)) {
        context.textAlign = toX(day) > width - TICK_ROOM ? 'right' : 'center';
        context.fillText(birthYear === null ? String(tick) : ageLabel(tick), toX(day), height - 6);
      }

      context.beginPath();
      context.rect(MARGIN.left, MARGIN.top, plotWidth, plotHeight);
      context.clip();

      context.fillStyle = color('--curve');
      context.globalAlpha = BAND_ALPHA;
      fillBand(context, spread.p10, spread.p90, sampleDays, toX, toY);
      fillBand(context, spread.p25, spread.p75, sampleDays, toX, toY);
      context.globalAlpha = 1;

      context.lineJoin = 'round';
      context.lineWidth = 1.5;
      if (deposits) {
        context.strokeStyle = color('--muted');
        context.setLineDash(DASHES.deposits);
        trace(deposits);
        if (shield) {
          context.strokeStyle = color('--series-6');
          context.lineCap = 'round';
          context.setLineDash(DASHES.shield);
          trace(shield);
          context.lineCap = 'butt';
        }
        context.setLineDash([]);
      }
      context.strokeStyle = color('--ink');
      context.lineWidth = 2.5;
      trace(median);
    }

    return followCanvas(canvas, draw, registerDraw);
  }, [player, index, locale, birthYear, ageLabel, registerDraw]);

  return <canvas ref={canvasRef} className="chart-canvas" role="img" aria-label={description} />;
}
