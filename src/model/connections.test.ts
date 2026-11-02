import { describe, expect, it } from 'vitest';
import { BOX_TYPES, catalog } from './catalog';
import { canConnect, connect } from './connections';
import type { Box, BoxType, Wire, WireKind } from './types';

const box = (type: BoxType, id: string = type): Box => ({ id, type, data: {} }) as Box;
const boxes = BOX_TYPES.map((type) => box(type));
const can = (source: string, target: string, kind: WireKind) => canConnect(boxes, { source, target, kind });

describe('canConnect', () => {
  it.each([
    ['income', 'transfer', 'money'],
    ['income', 'budget', 'money'],
    ['income', 'account', 'money'],
    ['transfer', 'account', 'money'],
    ['budget', 'account', 'money'],
    ['account', 'transfer', 'money'],
    ['account', 'withdrawal', 'money'],
    ['otp', 'withdrawal', 'money'],
    ['folketrygd', 'withdrawal', 'money'],
    ['otp', 'account', 'money'],
    ['folketrygd', 'account', 'money'],
    ['withdrawal', 'account', 'money'],
    ['return', 'account', 'influence'],
    ['return', 'otp', 'influence'],
    ['income', 'otp', 'basis'],
    ['income', 'folketrygd', 'basis'],
  ] as const)('lets %s go to %s as %s', (source, target, kind) => {
    expect(can(source, target, kind)).toBe(true);
  });

  it.each([
    ['income', 'otp', 'money', 'OTP is paid by the employer, so salary only gives the basis'],
    ['income', 'folketrygd', 'money', 'Folketrygden is not money'],
    ['transfer', 'folketrygd', 'money', 'Folketrygden is not money'],
    ['transfer', 'otp', 'money', 'OTP takes its deposits from the rule'],
    ['return', 'folketrygd', 'influence', 'it is regulated by law and has no market'],
    ['return', 'transfer', 'influence', 'only what holds value can grow'],
    ['return', 'account', 'money', 'a return moves no money'],
    ['income', 'withdrawal', 'money', 'the budget has nothing to do with withdrawals'],
    ['budget', 'withdrawal', 'money', 'the budget has nothing to do with withdrawals'],
    ['account', 'budget', 'money', 'the budget has nothing to do with withdrawals'],
    ['transfer', 'transfer', 'money', 'a chain has no use'],
    ['account', 'account', 'money', 'an account cannot go straight to an account, a transfer says how much'],
    ['income', 'income', 'money', 'an income takes nothing in'],
  ] as const)('refuses %s to %s as %s, since %s', (source, target, kind) => {
    expect(can(source, target, kind)).toBe(false);
  });

  it('refuses a box connected to itself', () => {
    expect(canConnect([box('transfer', 't')], { source: 't', target: 't', kind: 'money' })).toBe(false);
  });

  it('leaves G and yourself without connectors', () => {
    expect(catalog.g.takes).toBeUndefined();
    expect(catalog.g.gives).toBeUndefined();
    expect(catalog.me.takes).toBeUndefined();
    expect(catalog.me.gives).toBeUndefined();
  });
});

describe('loops', () => {
  it('always pass through a box that holds money, since boxes that only pass it on never feed each other', () => {
    const passesOn = BOX_TYPES.filter((type) => catalog[type].gives?.money && catalog[type].takes?.money && !catalog[type].holds);
    expect(passesOn.length).toBeGreaterThan(0);
    for (const source of passesOn) {
      for (const target of passesOn) {
        expect(catalog[target].takes!.money!.from).not.toContain(source);
      }
    }
  });
});

describe('connect', () => {
  const graph = [box('income', 'i1'), box('income', 'i2'), box('transfer', 't1'), box('transfer', 't2'), box('account', 'a1'), box('account', 'a2')];
  const wire = (source: string, target: string): Wire => ({ id: `${source}-${target}-money`, source, target, kind: 'money' });

  it('replaces the old income when a transfer takes only one', () => {
    const wires = connect(graph, [wire('i1', 't1')], { source: 'i2', target: 't1', kind: 'money' });
    expect(wires.map((item) => item.source)).toEqual(['i2']);
  });

  it('replaces the old account when a transfer gives only one', () => {
    const wires = connect(graph, [wire('t1', 'a1')], { source: 't1', target: 'a2', kind: 'money' });
    expect(wires.map((item) => item.target)).toEqual(['a2']);
  });

  it('lets one income have many transfers, and one account many sources', () => {
    let wires = connect(graph, [], { source: 'i1', target: 't1', kind: 'money' });
    wires = connect(graph, wires, { source: 'i1', target: 't2', kind: 'money' });
    wires = connect(graph, wires, { source: 't1', target: 'a1', kind: 'money' });
    wires = connect(graph, wires, { source: 't2', target: 'a1', kind: 'money' });
    expect(wires.length).toBe(4);
  });

  it('does not count the same wire twice', () => {
    const wires = connect(graph, [wire('i1', 't1')], { source: 'i1', target: 't1', kind: 'money' });
    expect(wires.length).toBe(1);
  });

  it('leaves wires of another kind alone', () => {
    const basis: Wire = { id: 'b', source: 'i1', target: 'o', kind: 'basis' };
    const wires = connect([...graph, box('otp', 'o')], [basis], { source: 'i1', target: 't1', kind: 'money' });
    expect(wires).toContainEqual(basis);
  });
});
