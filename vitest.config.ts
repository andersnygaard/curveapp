import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Every story is tested at these sizes, which are set in .storybook/preview.tsx. The addon sets the size of the
// browser before each story, so a size has to reach it through Storybook and not through the browser settings here.
// All of them in dark colours, and the light ones on a laptop, which is enough to see that nothing depends on the colours.
const RUNS = [
  { name: 'stories-laptop', viewport: 'laptop', colorScheme: 'dark' },
  { name: 'stories-tablet', viewport: 'tablet', colorScheme: 'dark' },
  { name: 'stories-phone', viewport: 'phone', colorScheme: 'dark' },
  { name: 'stories-laptop-light', viewport: 'laptop', colorScheme: 'light' },
] as const;

// One group at a time, so the slow engine tests do not share the machine with the browsers.
export default defineConfig({
  test: {
    projects: [
      {
        extends: './vite.config.ts',
        // The slowest engine tests take seconds on a laptop, and a build server can be a good deal slower.
        // Stylesheets are empty here unless asked for, and one of the tests reads the colours in it.
        test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}'], testTimeout: 30_000, sequence: { groupOrder: 1 }, css: { include: /styles\.css/ } },
      },
      ...RUNS.map(({ name, viewport, colorScheme }) => ({
        extends: './vite.config.ts',
        plugins: [storybookTest()],
        define: { 'import.meta.env.VITE_STORY_VIEWPORT': JSON.stringify(viewport) },
        test: {
          name,
          sequence: { groupOrder: 2 },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ contextOptions: { colorScheme } }),
            instances: [{ browser: 'chromium' as const }],
          },
        },
      })),
    ],
  },
});
