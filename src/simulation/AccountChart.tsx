import { useEffect, useRef } from 'react';
import { DAY_MS, DAYS_PER_YEAR } from '../engine/timeline';
import type { Player } from './player';

const MARGIN = { top: 10, right: 10, bottom: 24, left: 64 };
const FONT = '12px "Schibsted Grotesk Variable", system-ui, sans-serif';

interface Props {
  player: Player;
  index: number;
  locale: string;
  birthYear: number | null;
  ageLabel: (age: number) => string;
  description: string;
  registerDraw: (draw: () => void) => () => void;
}

function roundedStep(max: number): number {
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
}

export default function AccountChart({ player, index, locale, birthYear, ageLabel, description, registerDraw }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    // Earlier passes are only repainted when one finishes, not on every frame.
    const backdrop = document.createElement('canvas');
    const backdropContext = backdrop.getContext('2d')!;
    const { startMs, totalDays, sampleDays } = player.layout;
    const { yMax } = player.summary.stocks[index];
    const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
    const style = getComputedStyle(canvas);
    const color = (name: string) => style.getPropertyValue(name);
    let backdropKey = '';

    function draw() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      const plotWidth = width - MARGIN.left - MARGIN.right;
      const plotHeight = height - MARGIN.top - MARGIN.bottom;
      const toX = (day: number) => MARGIN.left + (day / totalDays) * plotWidth;
      const toY = (value: number) => MARGIN.top + plotHeight * (1 - value / yMax);

      // A line may start late and stop early, where the values are NaN.
      function trace(target: CanvasRenderingContext2D, values: ArrayLike<number>, end = values.length - 1) {
        const whole = Math.floor(end);
        target.beginPath();
        let drawing = false;
        for (let sample = 0; sample <= whole; sample++) {
          if (Number.isNaN(values[sample])) {
            drawing = false;
            continue;
          }
          if (drawing) target.lineTo(toX(sampleDays[sample]), toY(values[sample]));
          else target.moveTo(toX(sampleDays[sample]), toY(values[sample]));
          drawing = true;
        }
        if (drawing && whole < values.length - 1 && !Number.isNaN(values[whole + 1])) {
          const part = end - whole;
          const day = sampleDays[whole] + (sampleDays[whole + 1] - sampleDays[whole]) * part;
          target.lineTo(toX(day), toY(values[whole] + (values[whole + 1] - values[whole]) * part));
        }
        target.stroke();
      }

      function clipToPlot(target: CanvasRenderingContext2D) {
        target.beginPath();
        target.rect(MARGIN.left, MARGIN.top, plotWidth, plotHeight);
        target.clip();
      }

      function paintBackdrop() {
        const target = backdropContext;
        backdrop.width = canvas.width = Math.round(width * ratio);
        backdrop.height = canvas.height = Math.round(height * ratio);
        target.setTransform(ratio, 0, 0, ratio, 0, 0);
        target.font = FONT;
        target.lineWidth = 1;
        target.strokeStyle = color('--line');
        target.fillStyle = color('--muted');

        const yStep = roundedStep(yMax);
        target.textAlign = 'right';
        target.textBaseline = 'middle';
        for (let value = 0; value <= yMax; value += yStep) {
          const y = Math.round(toY(value)) + 0.5;
          target.beginPath();
          target.moveTo(MARGIN.left, y);
          target.lineTo(width - MARGIN.right, y);
          target.stroke();
          target.fillText(compact.format(value), MARGIN.left - 8, y);
        }

        const spanYears = totalDays / DAYS_PER_YEAR;
        const tickStep = spanYears <= 6 ? 1 : spanYears <= 11 ? 2 : spanYears <= 35 ? 5 : 10;
        target.textAlign = 'center';
        target.textBaseline = 'alphabetic';
        for (let year = new Date(startMs).getUTCFullYear() + 1; ; year++) {
          const day = (Date.UTC(year, 0, 1) - startMs) / DAY_MS;
          if (day > totalDays) break;
          const tick = birthYear === null ? year : year - birthYear;
          if (tick < 0 || tick % tickStep !== 0) continue;
          target.fillText(birthYear === null ? String(tick) : ageLabel(tick), toX(day), height - 6);
        }

        target.save();
        clipToPlot(target);
        target.strokeStyle = color('--curve');
        target.globalAlpha = 0.25;
        for (const pass of player.history) trace(target, pass[index]);
        target.restore();
      }

      const key = `${width}x${height}:${ratio}:${player.completed}`;
      if (key !== backdropKey) {
        paintBackdrop();
        backdropKey = key;
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(backdrop, 0, 0);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.save();
      clipToPlot(context);
      context.lineJoin = 'round';
      context.strokeStyle = color('--curve');
      context.lineWidth = 1.5;
      trace(context, player.current[index], player.progress * (sampleDays.length - 1));
      context.strokeStyle = color('--ink');
      context.lineWidth = 2.5;
      trace(context, player.summary.stocks[index].median);
      context.restore();
    }

    draw();
    const unregister = registerDraw(draw);
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => {
      unregister();
      observer.disconnect();
    };
  }, [player, index, locale, birthYear, ageLabel, registerDraw]);

  return <canvas ref={canvasRef} className="chart-canvas" role="img" aria-label={description} />;
}
