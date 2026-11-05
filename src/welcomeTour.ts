import { useCallback, useEffect, useState } from 'react';
import type { TourStep } from './components/Tour';
import type { Translations } from './i18n';
import { hasStoredBoxes } from './model/storage';
import { remember } from './remembered';

const SEEN_KEY = 'curve.tourSeen';

// Someone with boxes stored has been here before. With storage blocked it would show on every visit, so it does not,
// and that is why this reads storage itself: readChoice cannot tell blocked from empty.
function isNewHere(): boolean {
  try {
    return !hasStoredBoxes() && localStorage.getItem(SEEN_KEY) === null;
  } catch {
    return false;
  }
}

function markTourSeen() {
  remember(SEEN_KEY, 'true');
}

// The tour starts by itself for someone new, and the help button starts it again.
export function useWelcomeTour() {
  // Asked before the boxes are first saved, which would make everyone look like they have been here before.
  const [touring, setTouring] = useState(isNewHere);
  const [planShown, showPlan] = useState(false);

  useEffect(() => {
    if (touring) markTourSeen();
  }, [touring]);

  const start = useCallback(() => setTouring(true), []);
  // The same function on every render, so the tour's key listener is not taken down and put up again each time.
  const close = useCallback(() => setTouring(false), []);

  return { touring, start, close, planShown, showPlan };
}

// What lights up is decided here, so the tour itself knows nothing of tabs or boxes.
export function welcomeSteps(
  t: Translations,
  showTab: (tab: 'simulation' | 'input') => void,
  showPlan: (shown: boolean) => void,
): TourStep[] {
  const onTab = (tab: 'simulation' | 'input', planShown = false) => () => {
    showTab(tab);
    showPlan(planShown);
  };
  return [
    { ...t.tour.welcome, target: '.flags', centered: true, before: onTab('simulation') },
    { ...t.tour.input, target: '.input-toolbar', before: onTab('input') },
    { ...t.tour.canvas, target: '.box-me', before: onTab('input') },
    { ...t.tour.plan, target: '.plan', before: onTab('input', true) },
    { ...t.tour.files, target: '.file-buttons', before: onTab('input') },
    { ...t.tour.simulation, target: '.horizons', before: onTab('simulation') },
  ];
}
