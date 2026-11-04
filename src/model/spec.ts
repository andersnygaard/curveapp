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

export interface CompileContext extends GraphQuery {
  timeline: Timeline;
  everyDay: Uint8Array;
  addRule(rule: Rule): void;
  addStock(box: Box, stock: Omit<Stock, 'id'>): number;
  addFactor(factor: Factor, random: boolean): void;
  addGateSources(sources: GateSources): void;
  addPension(pension: TaxedPension): void;
  stockOf(box: Box): number;
  markCanRunOut(stock: number): void;
  // The day an age begins, or null without a birth year. Age is the year minus the birth year.
  dayOfAge(age: number): number | null;
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
  usesG?(box: B, query: GraphQuery): boolean;
  // Sets up what other boxes refer to.
  declare?(box: B, context: CompileContext): void;
  // Builds the rules. By now every box has been declared.
  build?(box: B, context: CompileContext): void;
  check?(box: B, query: GraphQuery): DiagnosticCode[];
}
