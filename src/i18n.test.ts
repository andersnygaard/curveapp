import { describe, expect, it } from 'vitest';
import { translations, wordsBetween } from './i18n';

describe('the words that change with the language', () => {
  const norwegian = wordsBetween('no', 'en');
  const english = wordsBetween('en', 'no');

  it('include every default name, so a new setup follows the language', () => {
    const from = new Map(norwegian);
    for (const [key, name] of Object.entries(translations.no.defaultNames)) {
      const other = translations.en.defaultNames[key as keyof typeof translations.en.defaultNames];
      if (name !== other) expect(from.get(name), key).toBe(other);
    }
  });

  it('take the old-age pension to its name in the other language and back', () => {
    expect(new Map(norwegian).get('Alderspensjon')).toBe('National pension');
    expect(new Map(english).get('National pension')).toBe('Alderspensjon');
  });

  it('include the words on the boxes that people use as names', () => {
    expect(new Map(english).get('Income')).toBe('Inntekt');
    expect(new Map(english).get('Fund')).toBe('Fond');
  });

  it('have one word for each in both languages, so changing back gives what was there', () => {
    const lower = (words: [string, string][]) => words.map(([from]) => from.toLowerCase());
    expect(new Set(lower(norwegian)).size).toBe(norwegian.length);
    expect(new Set(lower(english)).size).toBe(english.length);
    for (const [from, to] of norwegian) expect(new Map(english).get(to)).toBe(from);
  });

  it('leave out what is the same in both languages', () => {
    expect(norwegian.some(([from, to]) => from === to)).toBe(false);
  });

  it('has nothing to do when the language stays the same', () => {
    expect(wordsBetween('no', 'no')).toEqual([]);
  });
});
