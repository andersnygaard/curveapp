import type { TourStep } from './components/Tour';
import type { Translations } from './i18n';
import { hasStoredBoxes } from './model/storage';

const SEEN_KEY = 'curve.tourSeen';

// Someone with boxes stored has been here before. With storage blocked it would show on every visit, so it does not.
export function isNewHere(): boolean {
  try {
    return !hasStoredBoxes() && localStorage.getItem(SEEN_KEY) === null;
  } catch {
    return false;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'true');
  } catch {
    // Storage can be blocked, and then there is nothing to remember it in.
  }
}

// What lights up is decided here, so the tour itself knows nothing of tabs or boxes.
export function welcomeSteps(t: Translations, showTab: (tab: 'simulation' | 'input') => void): TourStep[] {
  const onTab = (tab: 'simulation' | 'input') => () => showTab(tab);
  return [
    { ...t.tour.welcome, target: '.flags', centered: true, before: onTab('simulation') },
    { ...t.tour.input, target: '.input-toolbar', before: onTab('input') },
    { ...t.tour.canvas, target: '.box-me', before: onTab('input') },
    { ...t.tour.plan, target: '.plan', before: onTab('input') },
    { ...t.tour.files, target: '.file-buttons', before: onTab('input') },
    { ...t.tour.simulation, target: '.horizons', before: onTab('simulation') },
  ];
}
