// The dependency rule, checked. The engine knows nothing of the model, and neither knows anything of the screen.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return filesIn(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

const importsOf = (text: string) => [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
const browserGlobal = /\b(window|document|localStorage|navigator)\./;

describe('the engine', () => {
  const files = filesIn('src/engine');

  it.each(files)('%s only imports from the engine', (file) => {
    for (const path of importsOf(readFileSync(file, 'utf8'))) expect(path).toMatch(/^\.\/[a-zA-Z]+$/);
  });

  it.each(files)('%s stays out of the browser', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(browserGlobal);
  });
});

describe('the model', () => {
  const files = filesIn('src/model');

  it.each(files)('%s imports neither React nor the screen', (file) => {
    for (const path of importsOf(readFileSync(file, 'utf8'))) {
      expect(path).not.toMatch(/react|xyflow|\/input|\/simulation|\/components|i18n/);
    }
  });

  it.each(files.filter((file) => !file.endsWith('storage.ts')))('%s stays out of the browser', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(browserGlobal);
  });
});

describe('the box types', () => {
  it('are one file each, and the engine never names one', () => {
    const boxFiles = filesIn('src/model/boxes');
    expect(boxFiles.length).toBeGreaterThanOrEqual(10);
    for (const file of filesIn('src/engine')) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/'(transfer|budget|withdrawal|account)'/);
    }
  });
});
