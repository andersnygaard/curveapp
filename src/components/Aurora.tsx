import { useEffect, useRef } from 'react';
import type { Player } from '../simulation/player';
import { currentTheme, onThemeChange } from '../theme';
import { traceLine } from './chartAxis';

const SHOWN_PASSES = 60;
const ROOM_ABOVE = 30;
const ROOM_BELOW = 8;
// Above this many times the highest median the lines run off the top, so one lucky pass does not flatten all the others.
const HEADROOM = 2.2;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  player: Player;
  index: number;
  registerDraw: (draw: () => void) => () => void;
}

// The passes of one account behind the headline. There are no axes and it adds no numbers, so screen readers skip it,
// and the chart further down is where they can be read. All the passes that have come in are there from the start, since
// playing them one by one would take minutes, and the one being played is traced on top. Without motion that one is left out.
export default function Aurora({ player, index, registerDraw }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    const backdrop = document.createElement('canvas');
    const backdropContext = backdrop.getContext('2d')!;
    const { totalDays, sampleDays } = player.layout;
    const style = getComputedStyle(canvas);
    const token = (name: string) => style.getPropertyValue(name).trim();
    let backdropKey = '';

    function draw() {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      const { median, yMax } = player.summary.stocks[index];
      const highest = Math.max(...Array.from(median).filter((value) => !Number.isNaN(value))) * HEADROOM;
      const top = highest > 0 ? highest : yMax;
      const toX = (day: number) => (day / totalDays) * width;
      const toY = (value: number) => ROOM_ABOVE + (height - ROOM_ABOVE - ROOM_BELOW) * (1 - value / top);
      const trace = (target: CanvasRenderingContext2D, values: ArrayLike<number>, end?: number) =>
        traceLine(target, values, sampleDays, toX, toY, end);
      const aurora = (target: CanvasRenderingContext2D) => {
        const gradient = target.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, token('--aurora-start'));
        gradient.addColorStop(0.55, token('--aurora-start'));
        gradient.addColorStop(1, token('--aurora-end'));
        return gradient;
      };

      const passes = player.arrived.slice(0, SHOWN_PASSES);
      const key = `${width}x${height}:${ratio}:${currentTheme()}:${passes.length}`;
      if (key !== backdropKey) {
        backdrop.width = canvas.width = Math.round(width * ratio);
        backdrop.height = canvas.height = Math.round(height * ratio);
        backdropContext.setTransform(ratio, 0, 0, ratio, 0, 0);
        backdropContext.strokeStyle = aurora(backdropContext);
        backdropContext.globalAlpha = Number(token('--aurora-alpha'));
        backdropContext.globalCompositeOperation = token('--aurora-blend') as GlobalCompositeOperation;
        for (const pass of passes) trace(backdropContext, pass[index]);
        backdropKey = key;
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(backdrop, 0, 0);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.lineJoin = 'round';
      if (!reducedMotion()) {
        context.strokeStyle = aurora(context);
        context.lineWidth = 1.5;
        trace(context, player.current[index], player.progress * (sampleDays.length - 1));
      }
      context.strokeStyle = token('--ink');
      context.lineWidth = 2.5;
      trace(context, median);
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
  }, [player, index, registerDraw]);

  return <canvas ref={canvasRef} className="sim-aurora" aria-hidden="true" />;
}
