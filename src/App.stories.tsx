import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, spyOn, userEvent, waitFor, within } from 'storybook/test';
import App from './App';

// What the app keeps in this browser. Someone who comes back is met with what is stored under these names, so they
// are written out here and never taken from the code.
const BOXES = 'curve.boxes';
const BACKUP = 'curve.boxes.backup';
const LANGUAGE = 'curve.language';
const THEME = 'curve.theme';
const PLAN_OPEN = 'curve.planOpen';
const TOUR_SEEN = 'curve.tourSeen';

// A setup someone saved earlier. The numbers are made up.
const savedSetup = JSON.stringify({
  version: 2,
  boxes: [
    {
      id: 'loaded',
      type: 'account',
      position: { x: 0, y: 0 },
      data: { name: 'From the file', startAmount: 123_000, startDate: '2030-01-01', currency: 'NOK', accountType: 'regular', taxRate: 0, inflation: 0 },
    },
    { id: 'me', type: 'me', position: { x: 400, y: 0 }, data: { birthYear: 0, retirementAge: null } },
  ],
  wires: [],
});

const PREFERS_DARK = '(prefers-color-scheme: dark)';
const WIDE_SCREEN = '(min-width: 60.01rem)';
const stored = () => localStorage.getItem(BOXES) ?? '';
const fileOf = (text: string) => new File([text], 'setup.json', { type: 'application/json' });

async function choose(canvasElement: HTMLElement, text: string) {
  await userEvent.upload(canvasElement.querySelector<HTMLInputElement>('input[type=file]')!, fileOf(text));
}

const meta: Meta<typeof App> = {
  title: 'App',
  component: App,
  beforeEach: () => {
    localStorage.removeItem(BOXES);
    localStorage.removeItem(BACKUP);
    // The stories read the English texts, so someone who has chosen English is the starting point here.
    localStorage.setItem(LANGUAGE, 'en');
    localStorage.setItem(TOUR_SEEN, 'true');
    localStorage.removeItem(PLAN_OPEN);
    localStorage.removeItem(THEME);
    const confirm = spyOn(window, 'confirm').mockReturnValue(true);
    return () => {
      confirm.mockRestore();
      localStorage.removeItem(BOXES);
      localStorage.removeItem(BACKUP);
      localStorage.removeItem(LANGUAGE);
      localStorage.removeItem(TOUR_SEEN);
      localStorage.removeItem(PLAN_OPEN);
      localStorage.removeItem(THEME);
    };
  },
};
export default meta;

type Story = StoryObj<typeof App>;

const root = document.documentElement;
const browserIsDark = () => window.matchMedia(PREFERS_DARK).matches;
const theLever = (canvasElement: HTMLElement) => within(canvasElement).getByRole('switch', { name: 'Light colours' });

export const FollowsTheBrowser: Story = {
  play: async ({ canvasElement }) => {
    const dark = browserIsDark();
    await waitFor(() => expect(root.dataset.theme).toBe(dark ? 'dark' : 'light'));
    await expect(theLever(canvasElement)).toHaveAttribute('aria-checked', String(!dark));
    await expect(localStorage.getItem(THEME)).toBeNull();
  },
};

export const TheLeverOverridesTheBrowserAndIsRemembered: Story = {
  play: async ({ canvasElement }) => {
    const other = browserIsDark() ? 'light' : 'dark';
    await userEvent.click(theLever(canvasElement));
    await waitFor(() => expect(root.dataset.theme).toBe(other));
    await expect(localStorage.getItem(THEME)).toBe(other);
  },
};

export const ARememberedChoiceComesBeforeTheBrowser: Story = {
  beforeEach: () => localStorage.setItem(THEME, browserIsDark() ? 'light' : 'dark'),
  play: async () => {
    await waitFor(() => expect(root.dataset.theme).toBe(browserIsDark() ? 'light' : 'dark'));
  },
};

// The browser can change while the page is open, for example when a laptop goes over to dark colours in the evening.
const browserScheme = { dark: false, changed: () => {} };

export const FollowsTheBrowserWhenItChangesUntilTheLeverIsUsed: Story = {
  beforeEach: () => {
    browserScheme.dark = false;
    const original = window.matchMedia.bind(window);
    const media = spyOn(window, 'matchMedia').mockImplementation((query) =>
      query === PREFERS_DARK
        ? ({
            get matches() {
              return browserScheme.dark;
            },
            addEventListener: (_: string, listener: () => void) => {
              browserScheme.changed = listener;
            },
            removeEventListener: () => {},
          } as unknown as MediaQueryList)
        : original(query),
    );
    return () => media.mockRestore();
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(root.dataset.theme).toBe('light'));
    browserScheme.dark = true;
    browserScheme.changed();
    await waitFor(() => expect(root.dataset.theme).toBe('dark'));

    await userEvent.click(theLever(canvasElement));
    await waitFor(() => expect(root.dataset.theme).toBe('light'));
    browserScheme.dark = false;
    browserScheme.changed();
    browserScheme.dark = true;
    browserScheme.changed();
    await expect(root.dataset.theme).toBe('light');
  },
};

const tourTitleIs = (canvasElement: HTMLElement, name: string) =>
  waitFor(() => expect(within(canvasElement).getByRole('dialog')).toHaveAccessibleName(name), { timeout: 5000 });

const thePlan = (canvasElement: HTMLElement) => within(canvasElement).queryByRole('complementary', { name: 'Plan' });

export const ThePlanBelongsToBothTabs: Story = {
  beforeEach: () => localStorage.setItem(PLAN_OPEN, 'true'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toHaveAttribute('aria-selected', 'true');
    await expect(thePlan(canvasElement)).toBeVisible();
    // The plan button is on the tab row, and on a narrow screen the plan lies over it until it is closed.
    if (!window.matchMedia(WIDE_SCREEN).matches) return;
    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    await expect(thePlan(canvasElement)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Plan' }));
    await expect(thePlan(canvasElement)).toBeNull();
    await userEvent.click(canvas.getByRole('tab', { name: 'Simulation' }));
    await expect(thePlan(canvasElement)).toBeNull();
    await expect(localStorage.getItem(PLAN_OPEN)).toBe('false');
  },
};

export const ThePlanButtonOpensItOnBothTabs: Story = {
  beforeEach: () => localStorage.setItem(PLAN_OPEN, 'false'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(thePlan(canvasElement)).toBeNull();
    await expect(canvas.getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(canvas.getByRole('button', { name: 'Plan' }));
    await expect(thePlan(canvasElement)).toBeVisible();
    await expect(localStorage.getItem(PLAN_OPEN)).toBe('true');
  },
};

export const ThePlanStartsOpenOnlyOnAWideScreen: Story = {
  play: async ({ canvasElement }) => {
    if (window.matchMedia(WIDE_SCREEN).matches) await expect(thePlan(canvasElement)).toBeVisible();
    else await expect(thePlan(canvasElement)).toBeNull();
    // Nothing is stored until a choice has been made, so it keeps following the screen.
    await expect(localStorage.getItem(PLAN_OPEN)).toBeNull();
  },
};

export const ThePlanTakesSpaceOrLiesOverThePage: Story = {
  beforeEach: () => localStorage.setItem(PLAN_OPEN, 'true'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const main = canvasElement.querySelector('.main')!;
    const plan = canvasElement.querySelector('.plan')!;
    await waitFor(() => expect(plan.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth + 0.5));
    if (window.matchMedia(WIDE_SCREEN).matches) {
      // Beside what it shares the page with, and the graphs are not covered.
      await waitFor(() => expect(main.getBoundingClientRect().right).toBeLessThanOrEqual(plan.getBoundingClientRect().left + 0.5));
      await expect(canvas.queryByRole('button', { name: 'Close the plan' })).toBeNull();
    } else {
      await expect(main.getBoundingClientRect().width).toBeCloseTo(document.documentElement.clientWidth, 0);
      await userEvent.click(canvas.getByRole('button', { name: 'Close the plan' }));
      await expect(thePlan(canvasElement)).toBeNull();
      await expect(localStorage.getItem(PLAN_OPEN)).toBe('false');
    }
  },
};

export const TheTourShowsThePlanWithoutChangingYourChoice: Story = {
  beforeEach: () => {
    localStorage.removeItem(TOUR_SEEN);
    localStorage.setItem(PLAN_OPEN, 'false');
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await tourTitleIs(canvasElement, 'Welcome to Curve');
    await expect(thePlan(canvasElement)).toBeNull();
    const next = () => userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await next();
    await tourTitleIs(canvasElement, 'Build your setup');
    await next();
    await tourTitleIs(canvasElement, 'Connect the boxes');
    await next();
    await tourTitleIs(canvasElement, 'Read the plan');
    await expect(thePlan(canvasElement)).not.toBeNull();
    await next();
    await tourTitleIs(canvasElement, 'Keep your setup');
    await expect(thePlan(canvasElement)).toBeNull();
    await expect(localStorage.getItem(PLAN_OPEN)).toBe('false');
    await userEvent.click(canvas.getByRole('button', { name: 'Skip' }));
    await expect(thePlan(canvasElement)).toBeNull();
  },
};

export const TheFirstVisitIsInNorwegian: Story = {
  beforeEach: () => localStorage.removeItem(LANGUAGE),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'Simulering' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('button', { name: 'Norsk' })).toHaveAttribute('aria-pressed', 'true');
    await expect(document.documentElement.lang).toBe('no');
    // The boxes are named when the setup is made, so they are in Norwegian as well.
    await waitFor(() => expect(JSON.parse(stored()).boxes.map((box: { data: { name?: string } }) => box.data.name)).toContain('Lønn'));
    await waitFor(() => expect(localStorage.getItem(LANGUAGE)).toBe('no'));
  },
};

export const AChosenLanguageIsKept: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await expect(document.documentElement.lang).toBe('en');
  },
};

export const EnglishIsOneClickAway: Story = {
  beforeEach: () => localStorage.removeItem(LANGUAGE),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'English' }));
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toBeVisible();
    await waitFor(() => expect(localStorage.getItem(LANGUAGE)).toBe('en'));
  },
};

const storedNames = () => JSON.parse(stored()).boxes.flatMap((box: { data: { name?: string } }) => box.data.name ?? []);

export const ChangingLanguageRenamesTheBoxes: Story = {
  beforeEach: () => localStorage.removeItem(LANGUAGE),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(storedNames()).toEqual(expect.arrayContaining(['Lønn', 'Fond', 'Aksjemarkedet'])));
    await userEvent.click(canvas.getByRole('button', { name: 'English' }));
    await waitFor(() => expect(storedNames()).toEqual(expect.arrayContaining(['Salary', 'Fund', 'Stock market'])));
    await expect(storedNames()).not.toContain('Fond');
    await userEvent.click(canvas.getByRole('button', { name: 'Norsk' }));
    await waitFor(() => expect(storedNames()).toEqual(expect.arrayContaining(['Lønn', 'Fond', 'Aksjemarkedet'])));
  },
};

export const ANameOfYourOwnStaysWhenTheLanguageChanges: Story = {
  beforeEach: () => {
    localStorage.setItem(BOXES, savedSetup);
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(storedNames()).toContain('From the file'));
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Norsk' }));
    await within(canvasElement).findByRole('tab', { name: 'Simulering' });
    await expect(storedNames()).toContain('From the file');
  },
};

export const ChoosingTheSameLanguageChangesNothing: Story = {
  beforeEach: () => {
    localStorage.setItem(BOXES, JSON.stringify({ ...JSON.parse(savedSetup), boxes: [{ ...JSON.parse(savedSetup).boxes[0], data: { ...JSON.parse(savedSetup).boxes[0].data, name: 'fund' } }] }));
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(storedNames()).toContain('fund'));
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'English' }));
    await expect(storedNames()).toContain('fund');
  },
};

export const TheTourWelcomesInNorwegianOnAFirstVisit: Story = {
  beforeEach: () => {
    localStorage.removeItem(LANGUAGE);
    localStorage.removeItem(TOUR_SEEN);
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await tourTitleIs(canvasElement, 'Velkommen til Curve');
    await waitFor(() => expect(canvasElement.querySelector('.tour-spot')).not.toBeNull());
    await userEvent.click(canvas.getByRole('button', { name: 'English' }));
    await tourTitleIs(canvasElement, 'Welcome to Curve');
  },
};

export const TheTourWelcomesSomeoneNew: Story = {
  beforeEach: () => localStorage.removeItem(TOUR_SEEN),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const next = () => userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    const litUp = (selector: string) =>
      waitFor(() => {
        const target = canvasElement.querySelector(selector)!.getBoundingClientRect();
        const spot = canvasElement.querySelector('.tour-spot')!.getBoundingClientRect();
        expect(spot.left).toBeLessThanOrEqual(target.left);
        expect(spot.right).toBeGreaterThanOrEqual(Math.min(target.right, window.innerWidth));
      });

    await tourTitleIs(canvasElement, 'Welcome to Curve');
    await litUp('.flags');
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toHaveAttribute('aria-selected', 'true');
    // The last step lights up what only shows once the first pass has arrived, and a step without its target is skipped.
    // On a busy machine the first pass takes longer than the tour waits, so this is about the tour and not about that.
    await waitFor(() => expect(canvasElement.querySelector('.period-scale')).not.toBeNull(), { timeout: 10_000 });

    await next();
    await tourTitleIs(canvasElement, 'Build your setup');
    await litUp('.input-toolbar');
    await expect(canvas.getByRole('tab', { name: 'Input' })).toHaveAttribute('aria-selected', 'true');

    await next();
    await tourTitleIs(canvasElement, 'Connect the boxes');
    await litUp('.box-me');

    await next();
    await tourTitleIs(canvasElement, 'Read the plan');
    await litUp('.plan');

    await next();
    await tourTitleIs(canvasElement, 'Keep your setup');
    await litUp('.file-buttons');

    await next();
    await tourTitleIs(canvasElement, 'See the result');
    await litUp('.period-scale');
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(canvas.getByRole('button', { name: 'Done' }));
    await expect(canvas.queryByRole('dialog')).toBeNull();
    await expect(localStorage.getItem(TOUR_SEEN)).not.toBeNull();
  },
};

export const TheTourCanChangeLanguageOnTheWay: Story = {
  beforeEach: () => localStorage.removeItem(TOUR_SEEN),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await tourTitleIs(canvasElement, 'Welcome to Curve');
    await waitFor(() => expect(canvasElement.querySelector('.tour-spot')).not.toBeNull());
    await userEvent.click(canvas.getByRole('button', { name: 'Norsk' }));
    await tourTitleIs(canvasElement, 'Velkommen til Curve');
    await userEvent.click(canvas.getByRole('button', { name: 'Neste' }));
    await tourTitleIs(canvasElement, 'Bygg oppsettet ditt');
  },
};

export const TheTourLeavesThoseWithBoxesAlone: Story = {
  beforeEach: () => {
    localStorage.removeItem(TOUR_SEEN);
    localStorage.setItem(BOXES, savedSetup);
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(JSON.parse(stored()).boxes[0].id).toBe('loaded'));
    await expect(within(canvasElement).queryByRole('dialog')).toBeNull();
    await expect(canvasElement.querySelector('.tour-card')).toBeNull();
  },
};

export const TheQuestionMarkOpensTheTour: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(stored()).not.toBe(''));
    await expect(canvas.queryByRole('dialog')).toBeNull();

    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    const open = canvas.getByRole('button', { name: 'Show the tour' });
    await userEvent.click(open);
    await tourTitleIs(canvasElement, 'Welcome to Curve');
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(canvas.getByRole('button', { name: 'Skip' }));
    await expect(canvas.queryByRole('dialog')).toBeNull();
    await expect(open).toHaveFocus();
  },
};

export const SavingGivesWhatIsStored: Story = {
  play: async ({ canvasElement }) => {
    const created = spyOn(URL, 'createObjectURL');
    let name = '';
    const click = spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      name = this.download;
    });
    await waitFor(() => expect(stored()).not.toBe(''));
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Save the setup as a file' }));
    await expect(name).toMatch(/^curve-\d{4}-\d{2}-\d{2}\.json$/);
    const saved = await (created.mock.calls[0][0] as Blob).text();
    await expect(saved).toBe(stored());
    await expect(JSON.parse(saved).version).toBeGreaterThan(1);
    click.mockRestore();
    created.mockRestore();
  },
};

export const LoadingReplacesTheSetup: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    await waitFor(() => expect(canvasElement.querySelectorAll('.box-income')).toHaveLength(1));

    await choose(canvasElement, savedSetup);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    // The canvas shows the boxes from the file, and they are in view.
    await waitFor(() => expect(canvas.getByLabelText('Name')).toHaveValue('From the file'));
    await expect(canvasElement.querySelectorAll('.box-income')).toHaveLength(0);
    await waitFor(() => expect(canvas.getByLabelText('Name')).toBeVisible());
    await waitFor(() => expect(JSON.parse(stored()).boxes[0].id).toBe('loaded'));
  },
};

// A number field keeps what is typed in it, so the same file loaded again needs a fresh canvas to show its own numbers.
export const LoadingAgainShowsTheNumbersInTheFile: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const startAmount = () => canvas.getByLabelText('Start amount');
    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    await choose(canvasElement, savedSetup);
    await waitFor(() => expect(startAmount()).toHaveValue(123_000));

    await userEvent.clear(startAmount());
    await userEvent.type(startAmount(), '5000');
    await expect(startAmount()).toHaveValue(5_000);
    await choose(canvasElement, savedSetup);
    await waitFor(() => expect(startAmount()).toHaveValue(123_000));
  },
};

export const SayingNoKeepsTheSetup: Story = {
  play: async ({ canvasElement }) => {
    spyOn(window, 'confirm').mockReturnValue(false);
    await waitFor(() => expect(stored()).not.toBe(''));
    const before = stored();
    await choose(canvasElement, savedSetup);
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    await expect(stored()).toBe(before);
    await expect(within(canvasElement).queryByRole('alert')).toBeNull();
  },
};

// In both languages, since each has the longer words somewhere else, so a help button alone on a row of its own would
// show here.
export const TheHeaderDoesNotSpreadOutOnASmallScreen: Story = {
  beforeEach: () => localStorage.setItem(LANGUAGE, 'no'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const middleOf = (selector: string) => {
      const { top, height } = canvasElement.querySelector(selector)!.getBoundingClientRect();
      return top + height / 2;
    };
    const onOneRow = async () => {
      await expect(Math.abs(middleOf('.tour-open') - middleOf('.lever'))).toBeLessThan(4);
      await expect(Math.abs(middleOf('.flags') - middleOf('.lever'))).toBeLessThan(4);
    };
    await expect(canvas.getByText('Lys')).toBeVisible();
    await onOneRow();
    await userEvent.click(canvas.getByRole('button', { name: 'English' }));
    await waitFor(() => expect(canvas.getByText('Light')).toBeVisible());
    await onOneRow();
  },
};

const resetButton = (canvasElement: HTMLElement) => within(canvasElement).getByRole('button', { name: 'Go back to the default setup' });
const storedTypes = () => JSON.parse(stored()).boxes.map((box: { type: string }) => box.type).sort();

export const ResetGoesBackToTheDefaultSetup: Story = {
  beforeEach: () => localStorage.setItem(BOXES, savedSetup),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    await waitFor(() => expect(canvas.getByLabelText('Name')).toHaveValue('From the file'));

    await userEvent.click(resetButton(canvasElement));
    await expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('default'));
    // The same boxes as someone new gets, and they are in view.
    await waitFor(() => expect(canvasElement.querySelectorAll('.box-income')).toHaveLength(1));
    await expect(canvas.queryByDisplayValue('From the file')).toBeNull();
    await waitFor(() => expect(storedTypes()).toEqual(['account', 'income', 'me', 'return', 'transfer', 'wealthTax']));
    await waitFor(() => expect(canvasElement.querySelector('.box-income')).toBeVisible());
  },
};

// There is no way back, so nothing happens until the answer is yes.
export const SayingNoToResetKeepsTheSetup: Story = {
  beforeEach: () => localStorage.setItem(BOXES, savedSetup),
  play: async ({ canvasElement }) => {
    spyOn(window, 'confirm').mockReturnValue(false);
    await waitFor(() => expect(storedTypes()).not.toContain('income'));
    const before = stored();
    await userEvent.click(resetButton(canvasElement));
    await expect(window.confirm).toHaveBeenCalled();
    await expect(stored()).toBe(before);
  },
};

export const ResetLeavesTheRestAlone: Story = {
  beforeEach: () => {
    localStorage.setItem(BOXES, savedSetup);
    localStorage.setItem(PLAN_OPEN, 'false');
    localStorage.setItem(THEME, 'light');
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(resetButton(canvasElement));
    await waitFor(() => expect(storedTypes()).toContain('income'));
    await expect(localStorage.getItem(PLAN_OPEN)).toBe('false');
    await expect(localStorage.getItem(THEME)).toBe('light');
    await expect(localStorage.getItem(LANGUAGE)).toBe('en');
    await expect(localStorage.getItem(TOUR_SEEN)).toBe('true');
    await expect(root.dataset.theme).toBe('light');
  },
};

export const ResetUsesTheLanguageOnScreen: Story = {
  beforeEach: () => {
    localStorage.setItem(BOXES, savedSetup);
    localStorage.setItem(LANGUAGE, 'no');
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Gå tilbake til standardoppsettet' }));
    await waitFor(() => expect(stored()).toContain('Lønn'));
    await expect(stored()).not.toContain('Salary');
  },
};

// The notice is about the boxes that could not be read, so it goes with them. What was stored is still kept.
export const TheRecoveredNoticeGoesWithTheOldSetup: Story = {
  beforeEach: () => localStorage.setItem(BOXES, 'not json {'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = 'Your saved boxes could not be read, so this is the default setup. A copy is kept in this browser.';
    await userEvent.click(canvas.getByRole('tab', { name: 'Input' }));
    await expect(canvas.getByText(notice)).toBeVisible();

    await userEvent.click(resetButton(canvasElement));
    await waitFor(() => expect(canvas.queryByText(notice)).toBeNull());
    await expect(localStorage.getItem(BACKUP)).toBe('not json {');
  },
};

// A message about a file that could not be read says nothing about the setup that is there now.
export const ResetClearsAnOldMessage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await choose(canvasElement, 'this is not json');
    await canvas.findByRole('alert');
    await userEvent.click(resetButton(canvasElement));
    await waitFor(() => expect(canvas.queryByRole('alert')).toBeNull());
  },
};

const unreadable = async (canvasElement: HTMLElement, text: string) => {
  const canvas = within(canvasElement);
  await waitFor(() => expect(stored()).not.toBe(''));
  const before = stored();
  await choose(canvasElement, text);
  const alert = await canvas.findByRole('alert');
  await expect(alert).toHaveTextContent('could not be read');
  // It never asks whether to replace the setup with something that cannot be read.
  await expect(window.confirm).not.toHaveBeenCalled();
  await expect(stored()).toBe(before);
  await fireEvent.click(within(alert).getByRole('button', { name: 'Close' }));
  await expect(canvas.queryByRole('alert')).toBeNull();
};

export const BrokenFile: Story = {
  play: ({ canvasElement }) => unreadable(canvasElement, 'this is not json'),
};

export const FileFromANewerVersion: Story = {
  play: ({ canvasElement }) => unreadable(canvasElement, JSON.stringify({ version: 99, boxes: [], wires: [] })),
};

export const BoxTypeItDoesNotKnow: Story = {
  play: ({ canvasElement }) =>
    unreadable(
      canvasElement,
      JSON.stringify({ version: 2, boxes: [{ id: 'x', type: 'spaceship', position: { x: 0, y: 0 }, data: {} }], wires: [] }),
    ),
};
