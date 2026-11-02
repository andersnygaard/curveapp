import type { Preview } from '@storybook/react-vite';
import '@xyflow/react/dist/style.css';
import { expect } from 'storybook/test';
import { LanguageContext, type Language } from '../src/i18n';
import '../src/styles.css';

// The canvas clips its boxes on purpose, so only the rest of the page has to stay within the screen.
function pastTheEdge(root: HTMLElement): string[] {
  return [...root.querySelectorAll('*')]
    .filter((element) => !element.closest('.react-flow'))
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 0.5)
    .map((element) => `${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}`);
}

const preview: Preview = {
  globalTypes: {
    language: {
      description: 'Language',
      toolbar: {
        icon: 'globe',
        items: [
          { value: 'en', title: 'English' },
          { value: 'no', title: 'Norsk' },
        ],
      },
    },
  },
  // The test run says which size to use. See vitest.config.ts.
  initialGlobals: { language: 'en', viewport: { value: import.meta.env.VITE_STORY_VIEWPORT, isRotated: false } },
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        phone: { name: 'Phone', styles: { width: '375px', height: '812px' }, type: 'mobile' },
        tablet: { name: 'Tablet', styles: { width: '768px', height: '1024px' }, type: 'tablet' },
        laptop: { name: 'Laptop', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
      },
    },
  },
  decorators: [
    (Story, { globals }) => (
      <LanguageContext.Provider value={globals.language as Language}>
        <Story />
      </LanguageContext.Provider>
    ),
  ],
  // Every story has to fit the screen, at every size it is tested at.
  afterEach: async ({ canvasElement }) => {
    await expect(pastTheEdge(canvasElement)).toEqual([]);
  },
};

export default preview;
