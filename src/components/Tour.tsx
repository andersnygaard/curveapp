import { useEffect, useRef, useState } from 'react';
import { useTranslations } from '../i18n';

// Long enough for a tab to open and for the first pass of a simulation to arrive.
const TARGET_WAIT_MS = 3000;
const SPOT_PADDING = 6;
const CARD_GAP = 12;

export interface TourStep {
  title: string;
  text: string;
  // A CSS selector for what lights up. A step whose target does not show on this screen is skipped.
  target: string;
  // Gets the page ready for the target, such as by opening a tab.
  before?: () => void;
  // The card stands in the middle of the screen instead of next to the target.
  centered?: boolean;
}

interface Props {
  steps: TourStep[];
  onClose: () => void;
}

interface Place {
  spot: { top: number; left: number; width: number; height: number };
  card: { top: number; left: number };
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

// Within the screen, since a target can be larger than it, and next to the target if there is room.
function placeOf(target: DOMRect, cardWidth: number, cardHeight: number, centered: boolean): Place {
  const { clientWidth: width, clientHeight: height } = document.documentElement;
  const left = clamp(target.left - SPOT_PADDING, 0, width);
  const top = clamp(target.top - SPOT_PADDING, 0, height);
  const right = clamp(target.right + SPOT_PADDING, left, width);
  const bottom = clamp(target.bottom + SPOT_PADDING, top, height);

  const below = bottom + CARD_GAP;
  const above = top - CARD_GAP - cardHeight;
  const beside = below + cardHeight <= height - CARD_GAP ? below : above >= CARD_GAP ? above : height - cardHeight - CARD_GAP;
  return {
    spot: { top, left, width: right - left, height: bottom - top },
    card: centered
      ? { top: (height - cardHeight) / 2, left: (width - cardWidth) / 2 }
      : { top: beside, left: clamp(left, CARD_GAP, width - cardWidth - CARD_GAP) },
  };
}

// The rest of the page is covered, while what is lit up can still be used.
function holeFor({ top, left, width, height }: Place['spot']): string {
  const [right, bottom] = [left + width, top + height];
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`;
}

// Only the page scrolls. Scrolling the target into view would also move the inside of a canvas.
function bringIntoView({ top, height }: DOMRect) {
  const screen = document.documentElement.clientHeight;
  if (top >= 0 && top + height <= screen) return;
  window.scrollBy({ top: top - Math.max(CARD_GAP, (screen - height) / 2) });
}

// A short walk through a page. It knows only the selectors it is given, so what it shows is up to the caller.
export default function Tour({ steps, onClose }: Props) {
  const t = useTranslations();
  const [{ index, direction }, setAt] = useState({ index: 0, direction: 1 });
  const [place, setPlace] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  function go(to: number, way: number) {
    if (to >= steps.length) return onClose();
    setReady(false);
    setAt(to < 0 ? { index: 0, direction: 1 } : { index: to, direction: way });
  }

  // Follows the target every frame, since it can move when the canvas fits its boxes or the page scrolls.
  useEffect(() => {
    step.before?.();
    const started = performance.now();
    let scrolled = false;
    let frame = requestAnimationFrame(function follow() {
      const target = document.querySelector(step.target)?.getBoundingClientRect();
      if (target && target.width > 0 && target.height > 0) {
        if (scrolled) {
          const placed = placeOf(target, card.current!.offsetWidth, card.current!.offsetHeight, step.centered ?? false);
          setPlace((current) => (JSON.stringify(current) === JSON.stringify(placed) ? current : placed));
          setReady(true);
        } else {
          bringIntoView(target);
          scrolled = true;
        }
      } else if (performance.now() - started > TARGET_WAIT_MS) {
        go(index + direction, direction);
        return;
      }
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [index, direction]);

  useEffect(() => {
    if (ready) next.current?.focus({ preventScroll: true });
  }, [ready, index]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus();
  }, []);

  // The keyboard stays in the card until the tour is closed.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const buttons = [...card.current!.querySelectorAll('button')];
      const from = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons.at((from + (event.shiftKey ? -1 : 1)) % buttons.length)!.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="tour">
      <div className="tour-cover" style={place ? { clipPath: holeFor(place.spot) } : undefined} />
      {place && <div className="tour-spot" style={place.spot} />}
      <div
        key={index}
        ref={card}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-text"
        style={ready && place ? place.card : { visibility: 'hidden' }}
      >
        <div aria-live="polite">
          <p className="tour-progress">{t.tourProgress(index + 1, steps.length)}</p>
          <h2 id="tour-title" className="tour-title">
            {step.title}
          </h2>
          <p id="tour-text" className="tour-text">
            {step.text}
          </p>
        </div>
        <div className="tour-actions">
          {!last && (
            <button type="button" className="tour-skip" onClick={onClose}>
              {t.tourSkip}
            </button>
          )}
          <div className="tour-moves">
            {index > 0 && (
              <button type="button" className="input-add" onClick={() => go(index - 1, -1)}>
                {t.tourBack}
              </button>
            )}
            <button ref={next} type="button" className="input-add tour-next" onClick={() => go(index + 1, 1)}>
              {last ? t.tourDone : t.tourNext}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
