import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion, type RegisterDraw } from '../components/canvas';
import type { Player } from './player';

// At most this much time passes in one frame, so a pass does not jump ahead after the page has been in the background.
const MAX_FRAME_MS = 100;

// The clock for the charts. While it runs, each frame moves the player on and draws every chart that has asked to be
// drawn. The player changes in place, so the charts read it there and React is not told of each frame.
export function useDrawLoop(player: Player | null, running: boolean, revision: number): RegisterDraw {
  // The pass number is read from the player, so the view is drawn again when a pass is finished.
  const [, setPassesPlayed] = useState(0);
  const drawers = useRef(new Set<() => void>());

  const registerDraw = useCallback((draw: () => void) => {
    drawers.current.add(draw);
    return () => {
      drawers.current.delete(draw);
    };
  }, []);

  useEffect(() => {
    if (!running || !player) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = Math.max(0, Math.min(now - last, MAX_FRAME_MS));
      last = now;
      if (player.advance(elapsed, prefersReducedMotion())) setPassesPlayed(player.completed);
      drawers.current.forEach((draw) => draw());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running, player]);

  // The median gets sharper in the background, also while paused.
  useEffect(() => drawers.current.forEach((draw) => draw()), [revision]);

  return registerDraw;
}
