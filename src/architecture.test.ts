// The dependency rule, checked. The engine knows nothing of the model, and neither knows anything of the screen.
import { describe, expect, it } from 'vitest';
import { BOX_TYPES } from './model/catalog';

const sources = import.meta.glob<string>(['./engine/**/*.ts', './model/**/*.ts', '!**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
const filesIn = (folder: string) => Object.keys(sources).filter((file) => file.startsWith(folder));
const importsOf = (text: string) => [...text.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
const browserGlobal = /\b(window|document|localStorage|navigator)\./;

describe('the engine', () => {
  const files = filesIn('./engine/');

  it.each(files)('%s only imports from the engine', (file) => {
    for (const path of importsOf(sources[file])) expect(path).toMatch(/^\.\/[a-zA-Z]+$/);
  });

  it.each(files)('%s stays out of the browser', (file) => {
    expect(sources[file]).not.toMatch(browserGlobal);
  });
});

describe('the model', () => {
  const files = filesIn('./model/');

  it.each(files)('%s imports neither React nor the screen', (file) => {
    for (const path of importsOf(sources[file])) {
      expect(path).not.toMatch(/react|xyflow|\/input|\/simulation|\/components|i18n/);
    }
  });

  it.each(files.filter((file) => !file.endsWith('storage.ts')))('%s stays out of the browser', (file) => {
    expect(sources[file]).not.toMatch(browserGlobal);
  });
});

describe('the box types', () => {
  // 'income' is also a phase of the day, and 'g' is the id of the G factor, so the engine may write those two.
  const named = BOX_TYPES.filter((type) => type !== 'income' && type !== 'g');

  it('have a file each', () => {
    expect(filesIn('./model/boxes/').length).toBeGreaterThanOrEqual(10);
  });

  it.each(filesIn('./engine/'))('are never named in %s', (file) => {
    for (const type of named) expect(sources[file]).not.toMatch(new RegExp(`['"\`]${type}['"\`]`));
  });
});
