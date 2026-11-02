import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Every story is tested at these sizes, which are set in .storybook/preview.tsx. The addon sets the size of the
// browser before each story, so a size has to reach it through Storybook and not through the browser settings here.
const VIEWPORTS = ['laptop', 'tablet', 'phone'];

// One group at a time, so the slow engine tests do not share the machine with the browsers.
export default defineConfig({
  test: {
    projects: [
      {
        extends: './vite.config.ts',
        // The slowest engine tests take seconds on a laptop, and a build server can be a good deal slower.
        test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}'], testTimeout: 30_000, sequence: { groupOrder: 1 } },
      },
      ...VIEWPORTS.map((viewport) => ({
        extends: './vite.config.ts',
        plugins: [storybookTest()],
        define: { 'import.meta.env.VITE_STORY_VIEWPORT': JSON.stringify(viewport) },
        test: {
          name: `stories-${viewport}`,
          sequence: { groupOrder: 2 },
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' as const }],
          },
        },
      })),
    ],
  },
});
