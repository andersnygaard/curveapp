import { useEffect, useMemo, useState } from 'react';
import type { Connection, Edge, Node, XYPosition } from '@xyflow/react';
import type { BaseAmount, IncomeInterval, ReturnInterval, Scenario } from '../simulation/scenario';

const STORAGE_KEY = 'curve.boxes';
const BOX_TYPES = ['income', 'transfer', 'account', 'otp', 'pension', 'g', 'me'];
// G from 1 May 2026.
const CURRENT_G = 136_549;
const DEFAULT_G_GROWTH = 0;
const DEFAULT_G_DEVIATION = 1;
const ACCOUNT_TAX_DEFAULTS = { accountType: 'regular', taxRate: 37.84, inflation: 2.5 } as const;

export type IncomeBox = Node<{ name: string; amount: number; interval: IncomeInterval }, 'income'>;
export type TransferBox = Node<{ name: string; amount: number }, 'transfer'>;
export type AccountBox = Node<
  {
    name: string;
    startAmount: number;
    startDate: string;
    currency: string;
    annualReturn: number;
    returnInterval: ReturnInterval;
    standardDeviation: number;
    accountType: 'regular' | 'ask';
    taxRate: number;
    inflation: number;
  },
  'account'
>;
export type OtpBox = Node<
  {
    name: string;
    startAmount: number;
    startDate: string;
    annualReturn: number;
    returnInterval: ReturnInterval;
    standardDeviation: number;
    lowRate: number;
    highRate: number;
  },
  'otp'
>;
export type PensionBox = Node<{ name: string; startAmount: number; startDate: string }, 'pension'>;
export type GBox = Node<{ g: number; gGrowth: number; standardDeviation: number }, 'g'>;
export type MeBox = Node<{ birthYear: number }, 'me'>;
export type Box = IncomeBox | TransferBox | AccountBox | OtpBox | PensionBox | GBox | MeBox;
export type BoxType = Box['type'];

export interface BoxGraph {
  nodes: Box[];
  edges: Edge[];
}

function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function newBox(type: BoxType, position: XYPosition): Box {
  const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  switch (type) {
    case 'income':
      return { id, type, position, data: { name: 'Lønn', amount: 50_000, interval: 'monthly' } };
    case 'transfer':
      return { id, type, position, data: { name: 'Sparetrekk', amount: 5_000 } };
    case 'account':
      return {
        id,
        type,
        position,
        data: {
          name: 'Fond',
          startAmount: 100_000,
          startDate: toIsoDate(new Date()),
          currency: 'NOK',
          annualReturn: 4,
          returnInterval: 'tradingDays',
          standardDeviation: 15,
          ...ACCOUNT_TAX_DEFAULTS,
        },
      };
    case 'otp':
      return {
        id,
        type,
        position,
        data: {
          name: 'OTP',
          startAmount: 0,
          startDate: toIsoDate(new Date()),
          annualReturn: 4,
          returnInterval: 'tradingDays',
          standardDeviation: 15,
          lowRate: 5,
          highRate: 10,
        },
      };
    case 'pension':
      return {
        id,
        type,
        position,
        data: { name: 'Folketrygden', startAmount: 0, startDate: toIsoDate(new Date()) },
      };
    case 'g':
      return {
        id,
        type,
        position,
        deletable: false,
        data: { g: CURRENT_G, gGrowth: DEFAULT_G_GROWTH, standardDeviation: DEFAULT_G_DEVIATION },
      };
    case 'me':
      return { id, type, position, deletable: false, data: { birthYear: 0 } };
  }
}

function usesG(box: Box): boolean {
  return box.type === 'otp' || box.type === 'pension';
}

// The G box is there exactly as long as a box reads from it.
export function syncGBox(nodes: Box[], position: XYPosition = { x: 0, y: -240 }): Box[] {
  const needed = nodes.some(usesG);
  const present = nodes.some((node) => node.type === 'g');
  if (needed && !present) return [...nodes, newBox('g', position)];
  if (!needed && present) return nodes.filter((node) => node.type !== 'g');
  return nodes;
}

function defaultGraph(): BoxGraph {
  const income = newBox('income', { x: 0, y: 70 });
  const transfer = newBox('transfer', { x: 410, y: 90 });
  const account = newBox('account', { x: 820, y: 0 });
  return {
    nodes: [income, transfer, account, newBox('me', { x: 410, y: -150 })],
    edges: [
      { id: `${income.id}-${transfer.id}`, source: income.id, target: transfer.id },
      { id: `${transfer.id}-${account.id}`, source: transfer.id, target: account.id },
    ],
  };
}

// Folketrygden used to keep G in its own card, so its values seed the G box when one is missing.
function restoreGBox(boxes: Box[]): Box[] {
  const synced = syncGBox(boxes);
  const created = synced.length > boxes.length ? synced[synced.length - 1] : undefined;
  const older = boxes.find((box) => box.type === 'pension' && 'g' in box.data)?.data as Partial<GBox['data']> | undefined;
  return synced.map((box) => {
    if (box.type !== 'g') return box;
    const data = box === created && older ? { ...box.data, ...older } : box.data;
    return { ...box, deletable: false, data: { g: data.g, gGrowth: data.gGrowth, standardDeviation: data.standardDeviation } };
  });
}

// The box for yourself is always on the canvas, so boxes saved before it existed get one.
function restoreMeBox(boxes: Box[]): Box[] {
  if (boxes.some((box) => box.type === 'me')) {
    return boxes.map((box) => (box.type === 'me' ? { ...box, deletable: false } : box));
  }
  const rightmost = Math.max(0, ...boxes.map((box) => box.position.x));
  const top = Math.min(0, ...boxes.map((box) => box.position.y));
  return [...boxes, newBox('me', { x: rightmost, y: top - 180 })];
}

function readGraph(): BoxGraph {
  try {
    const { nodes, edges } = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '');
    const boxes = (nodes as Box[])
      .filter((node) => BOX_TYPES.includes(node.type) && node.position && node.data)
      .map((box) => (box.type === 'account' ? { ...box, data: { ...ACCOUNT_TAX_DEFAULTS, ...box.data } } : box));
    const ids = new Set(boxes.map((box) => box.id));
    return {
      nodes: restoreMeBox(restoreGBox(boxes)),
      edges: (edges as Edge[]).filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
    };
  } catch {
    return defaultGraph();
  }
}

export function useBoxes() {
  const [graph, setGraph] = useState(readGraph);

  useEffect(() => {
    const stored = {
      nodes: graph.nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
      edges: graph.edges.map(({ id, source, target }) => ({ id, source, target })),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Storage can be blocked. The boxes then last until the page is reloaded.
    }
  }, [graph]);

  return [graph, setGraph] as const;
}

export function canConnect(nodes: Box[], { source, target }: { source: string; target: string }): boolean {
  const from = nodes.find((node) => node.id === source)?.type;
  const to = nodes.find((node) => node.id === target)?.type;
  return (
    (from === 'income' && (to === 'transfer' || to === 'pension' || to === 'otp')) ||
    (from === 'transfer' && to === 'account')
  );
}

// A transfer has one income and one account, so a new connector replaces the old one on that side.
export function connect({ nodes, edges }: BoxGraph, { source, target }: Connection): Edge[] {
  const isTransfer = (id: string) => nodes.find((node) => node.id === id)?.type === 'transfer';
  const kept = edges.filter(
    (edge) =>
      !(edge.source === source && edge.target === target) &&
      !(isTransfer(source) && edge.source === source) &&
      !(isTransfer(target) && edge.target === target),
  );
  return [...kept, { id: `${source}-${target}`, source, target }];
}

function validDate(date: string): string {
  return Number.isNaN(Date.parse(date)) ? toIsoDate(new Date()) : date;
}

function toBaseAmount({ g, gGrowth, standardDeviation }: GBox['data']): BaseAmount {
  return {
    value: Math.max(1, g),
    growth: Math.max(-50, gGrowth) / 100,
    volatility: Math.max(0, standardDeviation) / 100,
  };
}

function validBirthYear(year: number): number | null {
  return Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() ? year : null;
}

function toScenario({ nodes, edges }: BoxGraph): Scenario {
  const scenario: Scenario = {
    accounts: [],
    incomes: [],
    transfers: [],
    pensions: [],
    g: toBaseAmount({ g: CURRENT_G, gGrowth: DEFAULT_G_GROWTH, standardDeviation: DEFAULT_G_DEVIATION }),
    birthYear: null,
  };
  const incomeIdsInto = (id: string) => edges.filter((edge) => edge.target === id).map((edge) => edge.source);
  for (const box of nodes) {
    const { id } = box;
    if (box.type === 'account') {
      const { name, startAmount, startDate, currency, annualReturn, returnInterval, standardDeviation } = box.data;
      const { accountType, taxRate, inflation } = box.data;
      scenario.accounts.push({
        id,
        name,
        startAmount: Math.max(0, startAmount),
        startDate: validDate(startDate),
        currency,
        annualRate: Math.max(-99, annualReturn) / 100,
        returnInterval,
        volatility: Math.max(0, standardDeviation) / 100,
        ask:
          accountType === 'ask'
            ? { taxRate: Math.min(100, Math.max(0, taxRate)) / 100, inflation: Math.max(-50, inflation) / 100 }
            : undefined,
      });
    } else if (box.type === 'otp') {
      const { name, startAmount, startDate, annualReturn, returnInterval, standardDeviation, lowRate, highRate } = box.data;
      scenario.accounts.push({
        id,
        name,
        startAmount: Math.max(0, startAmount),
        startDate: validDate(startDate),
        currency: 'NOK',
        annualRate: Math.max(-99, annualReturn) / 100,
        returnInterval,
        volatility: Math.max(0, standardDeviation) / 100,
        pensionSavings: {
          lowRate: Math.max(0, lowRate) / 100,
          highRate: Math.max(0, highRate) / 100,
          incomeIds: incomeIdsInto(id),
        },
      });
    } else if (box.type === 'pension') {
      const { name, startAmount, startDate } = box.data;
      scenario.pensions.push({
        id,
        name,
        startAmount: Math.max(0, startAmount),
        startDate: validDate(startDate),
        currency: 'NOK',
        incomeIds: incomeIdsInto(id),
      });
    } else if (box.type === 'g') {
      scenario.g = toBaseAmount(box.data);
    } else if (box.type === 'me') {
      scenario.birthYear = validBirthYear(box.data.birthYear);
    } else if (box.type === 'income') {
      scenario.incomes.push({ id, ...box.data, amount: Math.max(0, box.data.amount) });
    } else {
      const incomeId = edges.find((edge) => edge.target === id)?.source;
      const accountId = edges.find((edge) => edge.source === id)?.target;
      if (incomeId && accountId) {
        scenario.transfers.push({ id, ...box.data, amount: Math.max(0, box.data.amount), incomeId, accountId });
      }
    }
  }
  return scenario;
}

// Moving or selecting a box leaves the scenario equal, so the simulation keeps running.
export function useScenario(graph: BoxGraph): Scenario {
  const key = JSON.stringify(toScenario(graph));
  return useMemo(() => JSON.parse(key) as Scenario, [key]);
}
