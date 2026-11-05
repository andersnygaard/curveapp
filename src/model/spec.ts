// What a box type has to say about itself. Each type answers this in its own file under boxes/.
import type { Factor, GateSources, Rule, Stock } from '../engine/engine';
import type { TaxedPension } from '../engine/norway';
import type { Timeline } from '../engine/timeline';
import type { Box, BoxOfType, BoxType, DefaultNames, WireKind } from './types';

export const MANY = Infinity;

export interface Intake {
  max: number;
  from: BoxType[];
}

export interface Assumptions {
  birthYear: number | null;
  g: { value: number; growth: number; volatility: number };
}

export type DiagnosticCode =
  | 'notConnected'
  | 'transfersExceedIncome'
  | 'budgetExceedsIncome'
  | 'needsBirthYear'
  | 'needsPayoutAge'
  | 'incomeNeverRuns'
  | 'restGoesOnlyOnce'
  | 'nothingToDraw'
  | 'surplusIsSpent'
  | 'sameAccount'
  | 'twoPrimaryHomes';

export interface Diagnostic {
  boxId: string;
  code: DiagnosticCode;
}

// Questions about the drawing, answered the same way when checking it and when compiling it.
export interface GraphQuery {
  assumptions: Assumptions;
  into(box: Box, kind: WireKind): Box[];
  outOf(box: Box, kind: WireKind): Box[];
  // For what counts everything of a type, whatever is wired.
  allOf<Type extends BoxType>(type: Type): BoxOfType<Type>[];
}

// What compiling can answer at any time: the drawing and the calendar.
export interface Compiling extends GraphQuery {
  timeline: Timeline;
  everyDay: Uint8Array;
  // The day an age begins, or null without a birth year. Age is the year minus the birth year.
  dayOfAge(age: number): number | null;
}

// The first pass, before any box is referred to: what each box holds and the paths it follows.
export interface DeclareContext extends Compiling {
  addStock(box: Box, stock: Omit<Stock, 'id'>): number;
  addFactor(factor: Factor, random: boolean): void;
  addRule(rule: Rule): void;
}

// The second pass. Every box has been declared, so any box can be referred to by its stock.
export interface BuildContext extends Compiling {
  stockOf(box: Box): number;
  addRule(rule: Rule): void;
  markMayFallShort(stock: number): void;
  addGateSources(sources: GateSources): void;
  addPension(pension: TaxedPension): void;
}

export interface BoxSpec<B extends Box = Box> {
  defaults(names: DefaultNames): B['data'];
  // Fields where a new box starts with a value but empty still means something of its own, so a stored empty stays empty.
  mayBeEmpty?: (keyof B['data'] & string)[];
  takes?: Partial<Record<WireKind, Intake>>;
  gives?: Partial<Record<WireKind, number>>;
  // Keeps value from one day to the next. A loop of money always passes through a box like this, so a day has
  // a defined order. The connection rules make sure of it, since boxes that only pass money on never feed each other.
  holds?: boolean;
  // Always on the canvas or tied to another box, so it cannot be deleted by itself.
  fixed?: boolean;
  // There can only be one, so it cannot be added while it is there.
  onlyOne?: boolean;
  // Reads G, so the G box is on the canvas while a box of this type is.
  readsG?: true;
  // Needs the path G follows in this drawing. Left out, a type that reads G always needs it.
  usesG?(box: B, query: GraphQuery): boolean;
  // The date this box starts to hold value. The simulation starts on the first of them.
  startsOn?(box: B): string;
  // Sets up what other boxes refer to.
  declare?(box: B, context: DeclareContext): void;
  // Builds the rules. By now every box has been declared.
  build?(box: B, context: BuildContext): void;
  check?(box: B, query: GraphQuery): DiagnosticCode[];
}
