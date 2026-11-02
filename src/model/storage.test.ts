import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from './compile';
import { defaultGraph, inputOf } from './graph';
import { loadGraph, parseGraph, saveGraph, serializeGraph, VERSION } from './storage';
import type { DefaultNames, Graph, PlacedBox, Wire } from './types';
import { runPass } from '../engine/engine';
import { noNoise } from '../engine/random';

const names: DefaultNames = {
  income: 'Salary',
  transfer: 'Savings',
  budget: 'Budget',
  budgetHousing: 'Housing',
  budgetLiving: 'Living',
  account: 'Fund',
  return: 'Market',
  otp: 'OTP',
  folketrygd: 'NP',
  withdrawal: 'Withdrawal',
  summary: 'Summary',
};

const accountV1 = {
  id: 'a',
  type: 'account',
  position: { x: 800, y: 0 },
  data: { name: 'Fund', startAmount: 100_000, startDate: '2027-01-01', currency: 'NOK', annualReturn: 8, returnInterval: 'monthly', standardDeviation: 15, accountType: 'ask', taxRate: 30, inflation: 2 },
};
const version1 = {
  nodes: [
    { id: 'i', type: 'income', position: { x: 0, y: 0 }, data: { name: 'Salary', amount: 50_000, interval: 'monthly' } },
    { id: 't', type: 'transfer', position: { x: 400, y: 0 }, data: { name: 'Savings', amount: 5_000 } },
    accountV1,
    { id: 'o', type: 'otp', position: { x: 400, y: 300 }, data: { name: 'OTP', startAmount: 0, startDate: '2027-01-01', annualReturn: 4, returnInterval: 'tradingDays', standardDeviation: 10, lowRate: 5, highRate: 10 } },
    { id: 'p', type: 'pension', position: { x: 800, y: 500 }, data: { name: 'NP', startAmount: 1_000_000, startDate: '2027-01-01' } },
    { id: 'g', type: 'g', position: { x: 0, y: 500 }, data: { g: 120_000, gGrowth: 1, standardDeviation: 2 } },
    { id: 'm', type: 'me', position: { x: 0, y: -200 }, data: { birthYear: 1990 } },
  ],
  edges: [
    { id: 'e1', source: 'i', target: 't' },
    { id: 'e2', source: 't', target: 'a' },
    { id: 'e3', source: 'i', target: 'o' },
    { id: 'e4', source: 'i', target: 'p' },
    { id: 'e5', source: 'gone', target: 'a' },
  ],
};

describe('boxes saved by version 1', () => {
  const graph = parseGraph(JSON.stringify(version1), names);
  const find = (id: string) => graph.boxes.find((box) => box.id === id)!;

  it('moves return out of the account into its own box and wires them', () => {
    const market = find('a-return');
    expect(market.type).toBe('return');
    expect(market.data).toMatchObject({ annualReturn: 8, returnInterval: 'monthly', standardDeviation: 15 });
    expect(graph.wires).toContainEqual({ id: 'a-return-a-influence', source: 'a-return', target: 'a', kind: 'influence' });
    expect(find('a').data).not.toHaveProperty('annualReturn');
    expect(find('o-return').data).toMatchObject({ annualReturn: 4, standardDeviation: 10 });
  });

  it('keeps every account on its own market, as before', () => {
    expect(graph.boxes.filter((box) => box.type === 'return').length).toBe(2);
  });

  it('places the new boxes clear of the others', () => {
    const market = find('a-return');
    for (const box of graph.boxes) {
      if (box.id === market.id) continue;
      const clear = Math.abs(box.position.x - market.position.x) >= 296 || Math.abs(box.position.y - market.position.y) >= 240;
      expect(clear, box.id).toBe(true);
    }
  });

  it('gives the wires the right kind and drops what points nowhere', () => {
    const kinds = Object.fromEntries(graph.wires.map((wire) => [`${wire.source}>${wire.target}`, wire.kind]));
    expect(kinds).toMatchObject({ 'i>t': 'money', 't>a': 'money', 'i>o': 'basis', 'i>p': 'basis' });
    expect(graph.wires.some((wire) => wire.source === 'gone')).toBe(false);
  });

  it('renames Folketrygden and keeps its numbers', () => {
    expect(find('p').type).toBe('folketrygd');
    expect(find('p').data).toMatchObject({ startAmount: 1_000_000, payoutAge: null, divisor: null });
  });

  it('keeps the pension figures: the amount was both money and basis, so it now becomes both', () => {
    expect(find('i').data).toMatchObject({ amount: 50_000, pensionBasis: 600_000, stopsAtRetirement: true });
  });

  it('keeps everything else that was stored', () => {
    expect(find('a').data).toMatchObject({ accountType: 'ask', taxRate: 30, inflation: 2 });
    expect(find('g').data).toEqual({ g: 120_000, gGrowth: 1, standardDeviation: 2 });
    expect(find('m').data).toEqual({ birthYear: 1990, retirementAge: null });
    expect(find('g').deletable).toBe(false);
    expect(find('m').deletable).toBe(false);
    expect(find('t').data).toMatchObject({ amount: 5_000, interval: 'monthly' });
  });

  it('gives the same result as before it was migrated', () => {
    const model = compile(inputOf(graph), 10);
    const pass = runPass(model, noNoise);
    const a = model.charted.indexOf(model.stocks.findIndex((stock) => stock.id === 'a'));
    // 100 000 at 8 % and 5 000 a month for ten years, paid at the end of each month.
    expect(pass.series[a].at(-1)).toBeGreaterThan(1_100_000);
    expect(pass.series[a].at(-1)).toBeLessThan(1_140_000);
  });

  it('fills in what an old Folketrygden card did not have', () => {
    const older = {
      nodes: [{ id: 'p', type: 'pension', position: { x: 0, y: 0 }, data: { name: 'NP', startAmount: 0, startDate: '2027-01-01', g: 110_000 } }],
      edges: [],
    };
    const restored = parseGraph(JSON.stringify(older), names);
    expect(restored.boxes.find((box) => box.type === 'g')!.data).toEqual({ g: 110_000, gGrowth: 0, standardDeviation: 1 });
  });

  it('moves G out of an old Folketrygden card when there is no G box', () => {
    const older = {
      nodes: [{ id: 'p', type: 'pension', position: { x: 0, y: 0 }, data: { name: 'NP', startAmount: 0, startDate: '2027-01-01', g: 110_000, gGrowth: 2, standardDeviation: 3 } }],
      edges: [],
    };
    const restored = parseGraph(JSON.stringify(older), names);
    expect(restored.boxes.find((box) => box.type === 'g')!.data).toEqual({ g: 110_000, gGrowth: 2, standardDeviation: 3 });
    expect(restored.boxes.find((box) => box.id === 'p')!.data).not.toHaveProperty('g');
  });

  it('adds the box for yourself and a G box when they are missing', () => {
    const bare = parseGraph(JSON.stringify({ nodes: [version1.nodes[4]], edges: [] }), names);
    expect(bare.boxes.filter((box) => box.type === 'me').length).toBe(1);
    expect(bare.boxes.filter((box) => box.type === 'g').length).toBe(1);
  });

  it('removes a G box nothing reads', () => {
    const lone = parseGraph(JSON.stringify({ nodes: [version1.nodes[5]], edges: [] }), names);
    expect(lone.boxes.some((box) => box.type === 'g')).toBe(false);
  });
});

describe('saving and loading', () => {
  it('keeps a summary and what it reads', () => {
    const boxes = [
      { id: 'a', type: 'account', position: { x: 0, y: 0 }, data: { name: 'a' } },
      { id: 's', type: 'summary', position: { x: 0, y: 0 }, data: { name: 'Both' } },
    ] as PlacedBox[];
    const wires: Wire[] = [{ id: 'a-s-basis', source: 'a', target: 's', kind: 'basis' }];
    const { boxes: loaded, wires: loadedWires } = parseGraph(serializeGraph({ boxes, wires }), names);
    expect(loaded.find((box) => box.id === 's')?.data).toEqual({ name: 'Both' });
    expect(loadedWires).toEqual(wires);
  });

  it('gets back what was saved, without what belongs to the canvas', () => {
    const graph = defaultGraph(names);
    const selected = { ...graph, boxes: graph.boxes.map((box) => ({ ...box, selected: true, measured: { width: 1, height: 1 } })) };
    const text = serializeGraph(selected);
    expect(text).not.toContain('measured');
    expect(text).not.toContain('selected');
    const again = parseGraph(text, names);
    expect(inputOf(again)).toEqual(inputOf(graph));
  });

  it('fills in fields added since the box was saved', () => {
    const graph = defaultGraph(names);
    const stored = JSON.parse(serializeGraph(graph));
    delete stored.boxes[0].data.stopsAtRetirement;
    const again = parseGraph(JSON.stringify(stored), names);
    expect(again.boxes[0].data).toMatchObject({ stopsAtRetirement: true });
  });

  it('refuses box types it does not know, instead of dropping them and writing over them', () => {
    const stored = JSON.parse(serializeGraph(defaultGraph(names)));
    stored.boxes.push({ id: 'x', type: 'future', position: { x: 0, y: 0 }, data: {} });
    expect(() => parseGraph(JSON.stringify(stored), names)).toThrow();
  });

  it('refuses a version it does not know', () => {
    const stored = JSON.parse(serializeGraph(defaultGraph(names)));
    expect(() => parseGraph(JSON.stringify({ ...stored, version: 99 }), names)).toThrow();
  });

  it('keeps a box that has lost its place on the canvas', () => {
    const stored = JSON.parse(serializeGraph(defaultGraph(names)));
    delete stored.boxes[0].position;
    const again = parseGraph(JSON.stringify(stored), names);
    expect(again.boxes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('replaces null with the default where null has no meaning, and keeps it where it has', () => {
    const graph = defaultGraph(names);
    const stored = JSON.parse(serializeGraph(graph));
    stored.boxes.push({ id: 'b', type: 'budget', position: { x: 0, y: 0 }, data: { name: 'B', lines: null } });
    stored.boxes.push({ id: 'o', type: 'otp', position: { x: 0, y: 0 }, data: { name: 'O', payoutAge: null } });
    const again = parseGraph(JSON.stringify(stored), names);
    expect(Array.isArray((again.boxes.find((box) => box.id === 'b')!.data as { lines: unknown }).lines)).toBe(true);
    expect((again.boxes.find((box) => box.id === 'o')!.data as { payoutAge: unknown }).payoutAge).toBeNull();
  });
});

// A file can lie around for years and skip many versions, so every version that has existed has an example here.
describe('files saved by earlier versions', () => {
  const files = import.meta.glob<string>('./__saved__/*.json', { query: '?raw', import: 'default', eager: true });
  const load = (version: number) => parseGraph(files[`./__saved__/version-${version}.json`], names);
  const boxOf = (graph: Graph, id: string) => graph.boxes.find((box) => box.id === id)?.data;

  it('has an example of every version up to the current one', () => {
    const versions = Array.from({ length: VERSION }, (_, index) => `./__saved__/version-${index + 1}.json`);
    expect(Object.keys(files).sort()).toEqual(versions);
  });

  it.each(Object.keys(files))('%s can still be read and simulated', (file) => {
    const graph = parseGraph(files[file], names);
    const { closing } = runPass(compile(inputOf(graph), 5), noNoise);
    expect(closing.every(Number.isFinite)).toBe(true);
    expect(closing.some((balance) => balance > 0)).toBe(true);
  });

  it.each(Object.keys(files))('%s comes out the same when saved again', (file) => {
    const graph = parseGraph(files[file], names);
    expect(inputOf(parseGraph(serializeGraph(graph), names))).toEqual(inputOf(graph));
  });

  it('keeps the figures in a file from version 1, which had one amount for both money and pension basis', () => {
    const graph = load(1);
    expect(boxOf(graph, 'salary')).toMatchObject({ amount: 40_000, pensionBasis: 480_000 });
    expect(boxOf(graph, 'fund')).toMatchObject({ startAmount: 100_000 });
    expect(boxOf(graph, 'occupational')).toMatchObject({ startAmount: 200_000, lowRate: 5, highRate: 8 });
    expect(boxOf(graph, 'national')).toMatchObject({ startAmount: 1_000_000 });
    expect(boxOf(graph, 'fund-return')).toMatchObject({ annualReturn: 6, standardDeviation: 12 });
    expect(graph.boxes.find((box) => box.id === 'national')?.type).toBe('folketrygd');
    expect(boxOf(graph, 'g')).toMatchObject({ g: 130_000 });
    expect(graph.wires.map(({ source, target, kind }) => `${source}>${target}:${kind}`)).toEqual(
      expect.arrayContaining(['salary>saving:money', 'saving>fund:money', 'salary>occupational:basis', 'salary>national:basis']),
    );
  });

  it('gives an account saved before shielding existed the default rate and nothing unused', () => {
    expect(boxOf(load(2), 'fund')).toMatchObject({ accountType: 'ask', shieldRate: 3.6, unusedShield: 0 });
  });

  it('keeps every figure and wire in a file from version 2', () => {
    const stored = JSON.parse(files['./__saved__/version-2.json']);
    const graph = load(2);
    for (const box of stored.boxes) expect(boxOf(graph, box.id)).toMatchObject(box.data);
    expect(graph.wires).toEqual(stored.wires);
  });
});

describe('what cannot be read', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    });
  });

  it('starts with the default the first time, with nothing to report', () => {
    const { graph, recovered } = loadGraph(names);
    expect(recovered).toBe(false);
    expect(graph.boxes.length).toBeGreaterThan(0);
  });

  it('keeps a copy and says so, instead of overwriting it in silence', () => {
    store.set('curve.boxes', 'not json {');
    const { graph, recovered } = loadGraph(names);
    expect(recovered).toBe(true);
    expect(store.get('curve.boxes.backup')).toBe('not json {');
    saveGraph(graph);
    expect(store.get('curve.boxes.backup')).toBe('not json {');
    expect(store.get('curve.boxes')).not.toBe('not json {');
  });

  it('reports a shape it does not know the same way', () => {
    store.set('curve.boxes', JSON.stringify({ version: 2, boxes: 'nonsense' }));
    expect(loadGraph(names).recovered).toBe(true);
  });

  it('keeps boxes from a newer version of the app', () => {
    const newer = JSON.stringify({ version: 99, boxes: [], wires: [] });
    store.set('curve.boxes', newer);
    expect(loadGraph(names).recovered).toBe(true);
    expect(store.get('curve.boxes.backup')).toBe(newer);
  });

  it('copes with storage that is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadGraph(names).recovered).toBe(false);
    expect(() => saveGraph(defaultGraph(names))).not.toThrow();
  });
});
