import { useEffect, useRef } from 'react';
import type { Player } from '../simulation/player';
import { currentTheme, onThemeChange } from '../theme';
import { fillBand, MARGIN, roundedStep, timeTicks, traceLine } from './chartAxis';

const DEPOSITS_DASH = [5, 4];
const SHIELD_DASH = [1, 4];
const FONT = '12px "Hanken Grotesk Variable", system-ui, sans-serif';
// The inner band lies on top of the outer one, so it is stronger without being another colour.
const BAND_ALPHA = 0.22;

interface Props {
  player: Player;
  index: number;
  locale: string;
  birthYear: number | null;
  ageLabel: (age: number) => string;
  description: string;
  registerDraw: (draw: () => void) => () => void;
}

export default function AccountChart({ player, index, locale, birthYear, ageLabel, description, registerDraw }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const { startMs, totalDays, sampleDays } = player.layout;
    const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
    const style = getComputedStyle(canvas);
    const color = (name: string) => style.getPropertyValue(name);
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

      context.textAlign = 'center';
      context.textBaseline = 'alphabetic';
      for (const { day, tick } of timeTicks(startMs, totalDays, birthYear)) {
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
        context.setLineDash(DEPOSITS_DASH);
        trace(deposits);
        if (shield) {
          context.strokeStyle = color('--series-6');
          context.lineCap = 'round';
          context.setLineDash(SHIELD_DASH);
          trace(shield);
          context.lineCap = 'butt';
        }
        context.setLineDash([]);
      }
      context.strokeStyle = color('--ink');
      context.lineWidth = 2.5;
      trace(median);
    }

    draw();
    const unregister = registerDraw(draw);
    const stopWatching = onThemeChange(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      unregister();
      stopWatching();
      observer.disconnect();
    };
  }, [player, index, locale, birthYear, ageLabel, registerDraw]);

  return <canvas ref={canvasRef} className="chart-canvas" role="img" aria-label={description} />;
}
