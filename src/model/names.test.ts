import { describe, expect, it } from 'vitest';
import { defaultGraph, inputOf } from './graph';
import { renameBoxes } from './names';
import { compile } from './compile';
import { runPass } from '../engine/engine';
import { noNoise } from '../engine/random';
import type { DefaultNames, Graph, PlacedBox } from './types';

const names: DefaultNames = {
  income: 'Lønn',
  transfer: 'Sparetrekk',
  budget: 'Budsjett',
  housing: 'Bolig',
  budgetLiving: 'Mat og forbruk',
  account: 'Fond',
  return: 'Aksjemarkedet',
  otp: 'OTP',
  folketrygd: 'Alderspensjon',
  withdrawal: 'Uttak',
  budgetLine: 'Ny linje',
};
const words = [
  ['Lønn', 'Salary'],
  ['Fond', 'Fund'],
  ['Bolig', 'Housing'],
  ['Budsjett', 'Budget'],
] as const;

const account = (id: string, name: string): PlacedBox =>
  ({
    id,
    type: 'account',
    position: { x: 0, y: 0 },
    data: { name, startAmount: 100_000, startDate: '2027-01-01', currency: 'NOK', accountType: 'regular', taxRate: 0, inflation: 0, shieldRate: 0, unusedShield: 0 },
  }) as PlacedBox;
const graphOf = (...boxes: PlacedBox[]): Graph => ({ boxes, wires: [] });
const namesIn = ({ boxes }: Graph) => boxes.map((box) => ('name' in box.data ? box.data.name : null));

describe('renaming boxes when the language changes', () => {
  it('changes a name that is all one word in the list', () => {
    expect(namesIn(renameBoxes(graphOf(account('a', 'Fond')), words))).toEqual(['Fund']);
  });

  it('leaves a longer name alone, so what someone has written stays', () => {
    expect(namesIn(renameBoxes(graphOf(account('a', 'Mitt fond'), account('b', 'Fond 2')), words))).toEqual(['Mitt fond', 'Fond 2']);
  });

  it('does not care about capitals or spaces at the ends', () => {
    expect(namesIn(renameBoxes(graphOf(account('a', 'fond'), account('b', ' FOND ')), words))).toEqual(['Fund', 'Fund']);
  });

  it('renames the lines in a budget as well as the budget', () => {
    const budget = {
      id: 'b',
      type: 'budget',
      position: { x: 0, y: 0 },
      data: { name: 'Budsjett', lines: [{ id: 'h', name: 'Bolig', amount: 10_000 }, { id: 'x', name: 'Hytta', amount: 2_000 }] },
    } as PlacedBox;
    const [renamed] = renameBoxes(graphOf(budget), words).boxes;
    expect(renamed.data).toMatchObject({ name: 'Budget', lines: [{ name: 'Housing', amount: 10_000 }, { name: 'Hytta', amount: 2_000 }] });
  });

  it('leaves boxes without a name alone', () => {
    const me = { id: 'me', type: 'me', position: { x: 0, y: 0 }, data: { birthYear: 1980 } } as PlacedBox;
    const graph = graphOf(me);
    expect(renameBoxes(graph, words)).toBe(graph);
  });

  it('gives back the same graph when nothing changes, so nothing starts again', () => {
    const graph = graphOf(account('a', 'Mitt fond'));
    expect(renameBoxes(graph, words)).toBe(graph);
  });

  it('changes nothing but the names, so no result changes', () => {
    const graph = defaultGraph(names);
    const closing = (from: Graph) => Array.from(runPass(compile(inputOf(from), 5), noNoise).closing);
    const renamed = renameBoxes(graph, words);
    expect(namesIn(renamed)).toContain('Salary');
    expect(closing(renamed)).toEqual(closing(graph));
    expect(renamed.wires).toBe(graph.wires);
  });
});
