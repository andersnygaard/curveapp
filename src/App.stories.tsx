import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, spyOn, userEvent, waitFor, within } from 'storybook/test';
import App from './App';

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

const TOUR_SEEN = 'curve.tourSeen';
const PLAN_OPEN = 'curve.planOpen';
const WIDE_SCREEN = '(min-width: 60.01rem)';
const stored = () => localStorage.getItem('curve.boxes') ?? '';
const fileOf = (text: string) => new File([text], 'setup.json', { type: 'application/json' });

async function choose(canvasElement: HTMLElement, text: string) {
  await userEvent.upload(canvasElement.querySelector<HTMLInputElement>('input[type=file]')!, fileOf(text));
}

const meta: Meta<typeof App> = {
  title: 'App',
  component: App,
  beforeEach: () => {
    localStorage.removeItem('curve.boxes');
    // The stories read the English texts, so someone who has chosen English is the starting point here.
    localStorage.setItem('curve.language', 'en');
    localStorage.setItem(TOUR_SEEN, 'true');
    localStorage.removeItem(PLAN_OPEN);
    const confirm = spyOn(window, 'confirm').mockReturnValue(true);
    return () => {
      confirm.mockRestore();
      localStorage.removeItem('curve.boxes');
      localStorage.removeItem('curve.language');
      localStorage.removeItem(TOUR_SEEN);
      localStorage.removeItem(PLAN_OPEN);
    };
  },
};
export default meta;

type Story = StoryObj<typeof App>;

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
  beforeEach: () => localStorage.removeItem('curve.language'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('tab', { name: 'Simulering' })).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('button', { name: 'Norsk' })).toHaveAttribute('aria-pressed', 'true');
    await expect(document.documentElement.lang).toBe('no');
    // The boxes are named when the setup is made, so they are in Norwegian as well.
    await waitFor(() => expect(JSON.parse(stored()).boxes.map((box: { data: { name?: string } }) => box.data.name)).toContain('Lønn'));
    await waitFor(() => expect(localStorage.getItem('curve.language')).toBe('no'));
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
  beforeEach: () => localStorage.removeItem('curve.language'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'English' }));
    await expect(canvas.getByRole('tab', { name: 'Simulation' })).toBeVisible();
    await waitFor(() => expect(localStorage.getItem('curve.language')).toBe('en'));
  },
};

const storedNames = () => JSON.parse(stored()).boxes.flatMap((box: { data: { name?: string } }) => box.data.name ?? []);

export const ChangingLanguageRenamesTheBoxes: Story = {
  beforeEach: () => localStorage.removeItem('curve.language'),
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
    localStorage.setItem('curve.boxes', savedSetup);
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
    localStorage.setItem('curve.boxes', JSON.stringify({ ...JSON.parse(savedSetup), boxes: [{ ...JSON.parse(savedSetup).boxes[0], data: { ...JSON.parse(savedSetup).boxes[0].data, name: 'fund' } }] }));
  },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(storedNames()).toContain('fund'));
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'English' }));
    await expect(storedNames()).toContain('fund');
  },
};

export const TheTourWelcomesInNorwegianOnAFirstVisit: Story = {
  beforeEach: () => {
    localStorage.removeItem('curve.language');
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
    await litUp('.horizons');
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
    localStorage.setItem('curve.boxes', savedSetup);
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
