// The two sets of colours, read from the stylesheet itself, so this cannot drift from what is on screen.
import { describe, expect, it } from 'vitest';
import styles from './styles.css?raw';

function tokensOf(selector: string): Map<string, string> {
  const start = styles.indexOf(`${selector} {`);
  const body = styles.slice(start, styles.indexOf('\n}', start));
  return new Map([...body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

const light = tokensOf(':root');
const dark = tokensOf(":root[data-theme='dark']");

function channels(hex: string): number[] {
  const digits = hex.slice(1);
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
}

const luminance = (hex: string) => {
  const [red, green, blue] = channels(hex).map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

function contrast(first: string, second: string): number {
  const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}

describe.each([
  ['Snø', light],
  ['Polarnatt', dark],
])('the colours of %s', (_, tokens) => {
  // A token may stand for another, such as the chosen edge for the curve.
  const colour = (name: string): string => {
    const value = tokens.get(name)!;
    const other = value.match(/^var\((--[a-z0-9-]+)\)$/);
    return other ? colour(other[1]) : value;
  };

  it.each([
    ['--ink', '--paper'],
    ['--ink', '--card'],
    ['--ink', '--warning-soft'],
    ['--muted', '--paper'],
    ['--muted', '--card'],
    ['--warning', '--paper'],
    ['--chosen-ink', '--chosen'],
  ])('make %s readable on %s', (text, background) => {
    expect(contrast(colour(text), colour(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['--curve', '--line-strong'])('make %s visible on the paper', (name) => {
    expect(contrast(colour(name), colour('--paper'))).toBeGreaterThanOrEqual(name === '--curve' ? 3 : 1.8);
  });

  it('frame a field so it can be found on a card', () => {
    expect(contrast(colour('--field-line'), colour('--card'))).toBeGreaterThanOrEqual(3);
  });

  it('mark what is chosen with an edge that shows on it', () => {
    expect(contrast(colour('--chosen-edge'), colour('--chosen'))).toBeGreaterThanOrEqual(3);
  });

  it('have eight different colours for the boxes', () => {
    const series = Array.from({ length: 8 }, (_unused, index) => colour(`--series-${index + 1}`));
    expect(new Set(series).size).toBe(8);
  });
});

describe('the two sets', () => {
  it('have the same names, so nothing falls back to the wrong colours', () => {
    expect([...dark.keys()]).toEqual([...light.keys()]);
    expect(light.size).toBeGreaterThan(20);
  });

  it('are the only place with colours, apart from the fade of the aurora', () => {
    const rest = styles.slice(styles.indexOf('html {'));
    expect(rest.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual(['#000']);
  });
});
