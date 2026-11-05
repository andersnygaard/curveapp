import { createContext, useContext, useEffect, useState } from 'react';
import type { Interval } from './engine/timeline';
import type { IncomeInterval } from './model/boxes/pay';
import type { ReturnInterval } from './model/boxes/returnBox';
import type { AddableType } from './model/catalog';
import type { PlanChange, PlanFlow, PlanInterval } from './model/plan';
import type { DiagnosticCode } from './model/spec';
import type { BoxType, DefaultNames, WireKind } from './model/types';
import { readChoice, remember } from './remembered';

export type Language = 'no' | 'en';

interface PlanLineParts {
  from: string;
  to: string;
  amount: string;
  per: string;
  // Empty when there is no loan.
  loan: string;
}

type PlanTexts = Record<PlanFlow, Record<PlanChange, (parts: PlanLineParts) => string>>;

const STORAGE_KEY = 'curve.language';
const DEFAULT_LANGUAGE: Language = 'no';

const defaultNames: Record<Language, DefaultNames> = {
  en: {
    income: 'Salary',
    transfer: 'Savings',
    budget: 'Budget',
    housing: 'Housing',
    budgetLiving: 'Food and living',
    account: 'Fund',
    return: 'Stock market',
    otp: 'OTP',
    folketrygd: 'National pension',
    withdrawal: 'Withdrawal',
    budgetLine: 'New line',
  },
  no: {
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
  },
};

// Words people use as names, beyond the default ones. One word for each in both languages, so changing back gives what was there.
const moreNames: Record<Language, string>[] = [
  { no: 'Inntekt', en: 'Income' },
  { no: 'Trekk', en: 'Transfer' },
  { no: 'Konto', en: 'Account' },
  { no: 'Avkastning', en: 'Return' },
  { no: 'Pensjon', en: 'Pension' },
  { no: 'Tjenestepensjon', en: 'Occupational pension' },
];

// What a box is called in the other language, for the names that are the same word.
export function wordsBetween(from: Language, to: Language): [string, string][] {
  if (from === to) return [];
  const keys = Object.keys(defaultNames.no) as (keyof DefaultNames)[];
  const words = [...keys.map((key) => ({ no: defaultNames.no[key], en: defaultNames.en[key] })), ...moreNames];
  return words.filter((word) => word.no !== word.en).map((word) => [word[from], word[to]]);
}

const en = {
  language: 'Language',
  saveFile: 'Save',
  saveFileHint: 'Save the setup as a file',
  loadFile: 'Load',
  loadFileHint: 'Load a setup from a file',
  reset: 'Reset',
  resetHint: 'Go back to the default setup',
  confirmReset: 'This replaces your setup with the default one. What you have now is lost unless you have saved it to a file.',
  lightColours: 'Light colours',
  dark: 'Dark',
  light: 'Light',
  confirmLoad: 'This replaces your setup with the one in the file. What you have now is lost unless you have saved it to a file.',
  fileUnreadable: 'The file could not be read, so your setup has not changed.',
  close: 'Close',
  tourOpen: 'Show the tour',
  tourNext: 'Next',
  tourBack: 'Back',
  tourSkip: 'Skip',
  tourDone: 'Done',
  tourProgress: (step: number, steps: number) => `Step ${step} of ${steps}`,
  tour: {
    welcome: {
      title: 'Welcome to Curve',
      text: 'Curve simulates saving and withdrawing through many possible markets. The numbers you see are only examples, and everything stays in your browser. Choose your language up here.',
    },
    input: {
      title: 'Build your setup',
      text: 'The Input tab is where you build your setup. These buttons add boxes for income, accounts, pensions and more.',
    },
    canvas: {
      title: 'Connect the boxes',
      text: 'Drag from a dot to a dot of the same shape to connect two boxes. This box is about you: your birth year gives your age on the graphs.',
    },
    plan: {
      title: 'Read the plan',
      text: 'The plan says what happens when, calculated from your setup.',
    },
    files: {
      title: 'Keep your setup',
      text: 'Your setup is kept in this browser. Save it as a file to have a copy or to move it to another machine, and load it again here.',
    },
    simulation: {
      title: 'See the result',
      text: 'The Simulation tab shows where the money comes from each year, and then each account, where the thick line is the median and the bands show where most of the passes lie. Here you choose how far ahead to look.',
    },
  },
  sections: 'Sections',
  tabs: { simulation: 'Simulation', input: 'Input' },
  privacyStatement: 'Privacy statement',
  locale: 'en-GB',
  defaultNames: defaultNames.en,
  // What a type of box is called, on its card. The name of a box is something else, such as Salary for an income.
  boxTypes: {
    income: 'Income',
    transfer: 'Transfer',
    budget: 'Budget',
    account: 'Account',
    return: 'Return',
    otp: 'Occupational pension',
    folketrygd: 'National pension',
    withdrawal: 'Withdrawal',
    housing: 'Housing',
    wealthTax: 'Wealth tax',
    g: 'G (base amount)',
    me: 'You',
  } satisfies Record<BoxType, string>,
  birthYear: 'Birth year',
  meNote: 'Shows your age on the graphs and turns the ages in the boxes into dates. Needs no connector.',
  toLastAgeOption: (age: number) => `To age ${age}`,
  ageTick: (age: number) => `${age} yrs`,
  addBox: {
    income: 'Add income',
    transfer: 'Add transfer',
    budget: 'Add budget',
    account: 'Add account',
    return: 'Add return',
    otp: 'Add occupational pension',
    folketrygd: 'Add national pension',
    withdrawal: 'Add withdrawal',
    housing: 'Add housing',
    wealthTax: 'Add wealth tax',
  } satisfies Record<AddableType, string>,
  deleteBox: (name: string) => `Delete ${name}`,
  deleteConnector: 'Delete connector',
  inputHelp:
    'Drag from a dot to a dot of the same shape. Money flows left to right, return comes in from above, and salary gives occupational and national pension their basis.',
  wireKinds: {
    money: 'Money',
    influence: 'Influence',
    basis: 'Basis',
  } satisfies Record<WireKind, string>,
  storageRecovered: 'Your saved boxes could not be read, so this is the default setup. A copy is kept in this browser.',
  name: 'Name',
  amount: 'Amount',
  netPay: 'Paid out (after tax)',
  pensionBasis: 'Pension basis (a year)',
  fromAge: 'From age',
  fromTheStart: 'From the start',
  toAge: 'To age',
  toTheEnd: 'Whole period',
  interval: 'Interval',
  startAmount: 'Start amount',
  startDate: 'Start date',
  currency: 'Currency',
  annualReturn: 'Real annual return (%)',
  annualReturnNote: 'Yearly growth in a median pass, above inflation. Use the annualised return, the way historical figures are given.',
  returnInterval: 'Return interval',
  standardDeviation: 'Standard deviation (%)',
  returnNote: 'Accounts on the same box follow the same market.',
  balance: 'Balance',
  date: 'Date',
  accountType: 'Account type',
  regularAccount: 'Regular',
  askAccount: 'ASK',
  taxRate: 'Tax on gains (%)',
  inflation: 'Inflation (%)',
  shieldRate: 'Shielding rate (%)',
  unusedShield: 'Unused shielding at start',
  afterTaxIfWithdrawn: (amount: string) => `After tax if everything is withdrawn: ${amount}`,
  gValue: 'G (NOK)',
  gGrowth: 'Expected G growth (%)',
  gNote: 'Used by occupational and national pension. Needs no connector. Growth means growth above inflation.',
  folketrygdNote: 'The pension from the national insurance scheme, worked out from your income. NAV pays it out.',
  lowRate: 'Rate up to 7.1 G (%)',
  highRate: 'Rate 7.1 to 12 G (%)',
  payoutAge: 'Paid out from age',
  payoutYears: 'Years of payout',
  divisor: 'Divisor',
  calculatedBalance: 'Calculated balance, not money. Do not add it to your savings.',
  budgetLineName: 'Line name',
  budgetLineAmount: 'Amount a month',
  addBudgetLine: 'Add line',
  deleteBudgetLine: (name: string) => `Delete ${name}`,
  budgetSum: 'Total a month',
  budgetLeft: 'Left to save a month',
  startAge: 'From age',
  withdrawalMode: 'Set as',
  modeAmount: 'Amount a month',
  modePercent: 'Percent of the accounts',
  perMonth: 'Amount a month (after tax)',
  percent: 'Percent a year (before tax)',
  withdrawalNote:
    'Pension and income wired in count first, pension after tax and income as it is paid out. What is missing comes from the accounts by size, and any surplus goes on. An ASK pays no tax on deposits and shielding, and then the tax on gains set on the account. A regular account pays none. Tax on pension follows the rules for 2026, on all your pensions together. Pension taken alongside a job gets higher tax than shown here.',
  homeKind: 'Type',
  primaryHome: 'Primary home',
  secondaryHome: 'Secondary home',
  cabin: 'Cabin',
  housingValue: 'Value',
  loan: 'Loan',
  paidOff: 'Paid off',
  housingNote:
    "The value stays the same in today's money, and the loan falls evenly to nothing by the date. The box moves no money, so put interest and repayments in a budget or similar. The type says how much it counts in the wealth tax. Needs no connector.",
  wealthAllowance: 'Allowance',
  wealthRate: 'Rate (%)',
  wealthHighFrom: 'Higher rate from',
  wealthHighRate: 'Higher rate (%)',
  wealthTaxNote:
    'Worked out each 31 December from all accounts and homes, with the rates for 2026. An ASK counts 80 % and a regular account 100 %, while occupational and national pension stay out. It is paid from the accounts by size, with tax on gains from an ASK, and what they cannot pay stays unpaid. Taxed together with a spouse, write in the whole values and double the allowance and the limit. Delete the box to leave the tax out. Needs no connector.',
  plan: 'Plan',
  closePlan: 'Close the plan',
  planNote: "The expected course without market swings, in today's money. Pension is before tax and withdrawals are after tax, with the tax on its own line. Amounts are rounded.",
  planToAge: (age: number) => `The plan runs to age ${age}.`,
  planForYears: (years: number) => `The plan runs for ${years} years.`,
  planEmpty: 'The plan appears when there is an account or a pension on the canvas.',
  planPer: {
    daily: 'a day',
    weekly: 'a week',
    monthly: 'a month',
    quarterly: 'a quarter',
    yearly: 'a year',
    once: 'once',
  } satisfies Record<PlanInterval, string>,
  planLines: {
    opening: {
      starts: ({ to, amount }) => `${to} starts with ${amount}`,
      changes: ({ to, amount }) => `${to} starts with ${amount}`,
      stops: ({ to }) => `${to} closes`,
    },
    housing: {
      starts: ({ from, amount, loan }) => (loan ? `${from} is worth ${amount}, with a loan of ${loan}` : `${from} is worth ${amount}`),
      changes: ({ from, amount, loan }) => (loan ? `${from} is worth ${amount}, with a loan of ${loan}` : `${from} is worth ${amount}`),
      stops: ({ from }) => `The loan on ${from} is paid off`,
    },
    deposit: {
      starts: ({ from, to, amount, per }) => `Pay ${amount} ${per} from ${from} into ${to}`,
      changes: ({ from, to, amount, per }) => `Payment from ${from} into ${to} becomes ${amount} ${per}`,
      stops: ({ from, to }) => `Payment from ${from} into ${to} stops`,
    },
    pensionDeposit: {
      starts: ({ to, amount, per }) => `The employer pays ${amount} ${per} into ${to}`,
      changes: ({ to, amount, per }) => `The employer's payment into ${to} becomes ${amount} ${per}`,
      stops: ({ to }) => `The employer's payment into ${to} stops`,
    },
    pension: {
      starts: ({ from, to, amount, per }) => (to ? `${from} pays ${amount} ${per} to ${to}` : `${from} pays ${amount} ${per}`),
      changes: ({ from, amount, per }) => `${from} now pays ${amount} ${per}`,
      stops: ({ from }) => `${from} is fully paid out`,
    },
    withdrawal: {
      starts: ({ from, amount, per }) => `Withdraw ${amount} ${per} from ${from}`,
      changes: ({ from, amount, per }) => `Withdrawal from ${from} becomes ${amount} ${per}`,
      stops: ({ from }) => `Withdrawal from ${from} stops`,
    },
    tax: {
      starts: ({ from, amount, per }) => `Tax on ${from} is ${amount} ${per}`,
      changes: ({ from, amount, per }) => `Tax on ${from} becomes ${amount} ${per}`,
      stops: ({ from }) => `Tax on ${from} stops`,
    },
    wealthTax: {
      starts: ({ amount, per }) => `Wealth tax is ${amount} ${per}`,
      changes: ({ amount, per }) => `Wealth tax becomes ${amount} ${per}`,
      stops: () => 'Wealth tax stops',
    },
    wealthTaxGain: {
      starts: ({ amount, per }) => `Tax on gains to pay the wealth tax is ${amount} ${per}`,
      changes: ({ amount, per }) => `Tax on gains to pay the wealth tax becomes ${amount} ${per}`,
      stops: () => 'Tax on gains to pay the wealth tax stops',
    },
    surplus: {
      starts: ({ to, amount, per }) => (to ? `Surplus of ${amount} ${per} goes to ${to}` : `Surplus of ${amount} ${per} counts as spent`),
      changes: ({ to, amount, per }) => (to ? `Surplus to ${to} becomes ${amount} ${per}` : `Surplus counted as spent becomes ${amount} ${per}`),
      stops: ({ to }) => (to ? `Surplus to ${to} stops` : 'Surplus counted as spent stops'),
    },
    move: {
      starts: ({ from, to, amount, per }) => `Move ${amount} ${per} from ${from} to ${to}`,
      changes: ({ from, to, amount, per }) => `Move from ${from} to ${to} becomes ${amount} ${per}`,
      stops: ({ from, to }) => `Move from ${from} to ${to} stops`,
    },
    unmet: {
      starts: ({ from, amount, per }) => `${from} is short by ${amount} ${per}`,
      changes: ({ from, amount, per }) => `${from} is now short by ${amount} ${per}`,
      stops: ({ from }) => `${from} is covered again`,
    },
    wealthTaxShort: {
      starts: ({ amount, per }) => `Wealth tax is short by ${amount} ${per}`,
      changes: ({ amount, per }) => `Wealth tax is now short by ${amount} ${per}`,
      stops: () => 'Wealth tax is covered again',
    },
  } satisfies PlanTexts,
  intervals: {
    daily: 'Daily',
    tradingDays: 'Trading days',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  } satisfies Record<Interval | IncomeInterval | ReturnInterval, string>,
  noAccounts: 'Add an account in the Input tab to start the simulation.',
  calculating: 'Calculating…',
  simulationFailed: 'The simulation stopped because of an error.',
  somethingWentWrong: 'Something went wrong on this page. Your boxes are still saved in this browser. Try reloading the page.',
  simulationPeriod: 'Simulation period',
  yearsOption: (years: number) => `${years} years`,
  passNumber: (pass: number) => `Pass ${pass}`,
  pause: 'Pause',
  resume: 'Resume',
  simulationLegend:
    "All amounts are in today's money. The thin lines at the top are single passes. The thick line is the median of all the passes, the inner band holds half of them and the outer band eight in ten.",
  spreadAtEnd: (low: string, high: string) => `Eight in ten passes end between ${low} and ${high}.`,
  depositsLegend: 'The dashed line is what is left of what you put in, so the gap up to the thick line is the return.',
  shieldLegend: 'The dotted line is the unused shielding deduction, which lowers the tax on gains.',
  withdrawnInTotal: (amount: string) => `Paid out in total: ${amount}`,
  withdrawnAndTax: (amount: string, tax: string) => `Paid out in total: ${amount} after tax, and ${tax} in tax`,
  withdrawalsPerMonth: 'Where the money comes from, in kroner a month after tax, with the tax on top. An average of all the passes.',
  otherBoxes: 'Other',
  need: 'Need',
  surplus: 'Left over',
  surplusGoesTo: (name: string) => `Goes on to ${name}`,
  surplusIsSpent: 'Counts as spent',
  short: 'Missing',
  tax: 'Tax',
  wealthTax: 'Wealth tax',
  medianAfter: (years: number, amount: string) => `Median after ${years} years: ${amount}`,
  medianAtAge: (age: number, amount: string) => `Median at age ${age}: ${amount}`,
  balanceAtAge: (age: number, amount: string) => `Balance at age ${age}: ${amount}`,
  payoutPerYear: (amount: string) => `Paid out: about ${amount} a year`,
  heldWholePeriod: (share: string) => `${share} of the passes last the whole period.`,
  heldToAge: (share: string, age: number) => `${share} of the passes last to age ${age}.`,
  gateHeldWholePeriod: (name: string, share: string) => `${name} is covered for the whole period in ${share} of the passes.`,
  gateHeldToAge: (name: string, share: string, age: number) => `${name} is covered to age ${age} in ${share} of the passes.`,
  diagnostics: {
    notConnected: 'Not connected, so it has no effect.',
    transfersExceedIncome: 'The transfers add up to more than is paid out, so the last ones get less.',
    budgetExceedsIncome: 'The budget is larger than the income, so nothing is saved.',
    needsBirthYear: 'Needs your birth year in the box for yourself.',
    needsPayoutAge: 'Needs an age to be paid out from.',
    incomeNeverRuns: 'From age is not before To age, so it never pays anything.',
    restGoesOnlyOnce: 'What is left of a payment can only go one way, so only the first connector gets it.',
    nothingToDraw: 'Connect the accounts, pensions and incomes it should draw from.',
    surplusIsSpent: 'Pension and income beyond the need count as spent. Connect an account if it should be saved.',
    sameAccount: 'Goes back to the account it came from, so it has no effect.',
    twoPrimaryHomes: 'You can only be registered as living in one place, so only one home can be the primary home.',
  } satisfies Record<DiagnosticCode, string>,
};

// One shape for both languages, the English one. A Norwegian text that is missing or extra is an error right here.
export type Translations = typeof en;

const no: Translations = {
  language: 'Språk',
  saveFile: 'Lagre',
  saveFileHint: 'Lagre oppsettet som fil',
  loadFile: 'Last inn',
  loadFileHint: 'Last inn et oppsett fra fil',
  reset: 'Nullstill',
  resetHint: 'Gå tilbake til standardoppsettet',
  confirmReset: 'Dette erstatter oppsettet ditt med standardoppsettet. Det du har nå går tapt hvis du ikke har lagret det til en fil.',
  lightColours: 'Lyse farger',
  dark: 'Mørk',
  light: 'Lys',
  confirmLoad: 'Dette erstatter oppsettet ditt med det som er i filen. Det du har nå går tapt hvis du ikke har lagret det til en fil.',
  fileUnreadable: 'Filen kunne ikke leses, så oppsettet ditt er ikke endret.',
  close: 'Lukk',
  tourOpen: 'Vis omvisningen',
  tourNext: 'Neste',
  tourBack: 'Tilbake',
  tourSkip: 'Hopp over',
  tourDone: 'Ferdig',
  tourProgress: (step: number, steps: number) => `Steg ${step} av ${steps}`,
  tour: {
    welcome: {
      title: 'Velkommen til Curve',
      text: 'Curve simulerer sparing og uttak gjennom mange mulige markeder. Tallene du ser er bare eksempler, og alt blir i nettleseren din. Velg språk her oppe.',
    },
    input: {
      title: 'Bygg oppsettet ditt',
      text: 'I Inndata-fanen bygger du oppsettet ditt. Knappene legger til bokser for inntekt, kontoer, pensjon og mer.',
    },
    canvas: {
      title: 'Koble boksene',
      text: 'Dra fra en prikk til en prikk med samme form for å koble to bokser. Denne boksen handler om deg: Fødselsåret gir alderen din på grafene.',
    },
    plan: {
      title: 'Les planen',
      text: 'Planen viser hva som skjer når, regnet ut fra oppsettet ditt.',
    },
    files: {
      title: 'Ta vare på oppsettet',
      text: 'Oppsettet ligger i denne nettleseren. Lagre det som fil for å ha en kopi eller flytte det til en annen maskin, og last det inn igjen her.',
    },
    simulation: {
      title: 'Se resultatet',
      text: 'Simulering-fanen viser hvor pengene kommer fra hvert år, og deretter hver konto, der den tykke streken er medianen og båndene viser hvor de fleste passene ligger. Her velger du hvor langt frem du vil se.',
    },
  },
  sections: 'Visninger',
  tabs: { simulation: 'Simulering', input: 'Inndata' },
  privacyStatement: 'Personvernerklæring',
  locale: 'nb-NO',
  defaultNames: defaultNames.no,
  boxTypes: {
    income: 'Inntekt',
    transfer: 'Trekk',
    budget: 'Budsjett',
    account: 'Konto',
    return: 'Avkastning',
    otp: 'Tjenestepensjon (OTP)',
    folketrygd: 'Alderspensjon (NAV)',
    withdrawal: 'Uttak',
    housing: 'Bolig',
    wealthTax: 'Formuesskatt',
    g: 'G (grunnbeløpet)',
    me: 'Deg selv',
  },
  birthYear: 'Fødselsår',
  meNote: 'Viser alderen din på grafene og gjør om aldrene i boksene til datoer. Trenger ingen connector.',
  toLastAgeOption: (age: number) => `Til ${age} år`,
  ageTick: (age: number) => `${age} år`,
  addBox: {
    income: 'Legg til inntekt',
    transfer: 'Legg til trekk',
    budget: 'Legg til budsjett',
    account: 'Legg til konto',
    return: 'Legg til avkastning',
    otp: 'Legg til OTP',
    folketrygd: 'Legg til alderspensjon',
    withdrawal: 'Legg til uttak',
    housing: 'Legg til bolig',
    wealthTax: 'Legg til formuesskatt',
  } satisfies Record<AddableType, string>,
  deleteBox: (name: string) => `Slett ${name}`,
  deleteConnector: 'Slett connector',
  inputHelp:
    'Dra fra en prikk til en prikk med samme form. Penger går fra venstre mot høyre, avkastning kommer ovenfra, og lønn gir OTP og alderspensjonen grunnlaget deres.',
  wireKinds: {
    money: 'Penger',
    influence: 'Påvirkning',
    basis: 'Grunnlag',
  },
  storageRecovered: 'De lagrede boksene dine kunne ikke leses, så dette er standardoppsettet. En kopi er tatt vare på i denne nettleseren.',
  name: 'Navn',
  amount: 'Beløp',
  netPay: 'Netto utbetalt',
  pensionBasis: 'Pensjonsgrunnlag (i året)',
  fromAge: 'Fra alder',
  fromTheStart: 'Fra starten',
  toAge: 'Til alder',
  toTheEnd: 'Hele perioden',
  interval: 'Intervall',
  startAmount: 'Startbeløp',
  startDate: 'Startdato',
  currency: 'Valuta',
  annualReturn: 'Årlig realavkastning (%)',
  annualReturnNote: 'Årlig vekst i et middels pass, over inflasjon. Bruk annualisert avkastning, slik historiske tall oppgis.',
  returnInterval: 'Avkastningsintervall',
  standardDeviation: 'Standardavvik (%)',
  returnNote: 'Kontoer på samme boks følger samme marked.',
  balance: 'Beholdning',
  date: 'Dato',
  accountType: 'Type',
  regularAccount: 'Vanlig',
  askAccount: 'ASK',
  taxRate: 'Skatt på gevinst (%)',
  inflation: 'Inflasjon (%)',
  shieldRate: 'Skjermingsrente (%)',
  unusedShield: 'Ubenyttet skjerming ved start',
  afterTaxIfWithdrawn: (amount: string) => `Etter skatt hvis alt tas ut: ${amount}`,
  gValue: 'G (kr)',
  gGrowth: 'Forventet G-vekst (%)',
  gNote: 'Brukes av OTP og alderspensjonen. Trenger ingen connector. Veksten er reallønnsvekst, altså utover prisveksten.',
  folketrygdNote: 'Pensjonen fra folketrygden, regnet ut fra inntekten din. NAV betaler den ut.',
  lowRate: 'Sats opp til 7,1 G (%)',
  highRate: 'Sats 7,1 til 12 G (%)',
  payoutAge: 'Utbetaling fra alder',
  payoutYears: 'Antall år',
  divisor: 'Delingstall',
  calculatedBalance: 'Beregnet beholdning, ikke penger. Ikke legg den sammen med sparingen din.',
  budgetLineName: 'Navn på linje',
  budgetLineAmount: 'Beløp i måneden',
  addBudgetLine: 'Legg til linje',
  deleteBudgetLine: (name: string) => `Slett ${name}`,
  budgetSum: 'Sum i måneden',
  budgetLeft: 'Til overs i måneden',
  startAge: 'Fra alder',
  withdrawalMode: 'Angis som',
  modeAmount: 'Beløp i måneden',
  modePercent: 'Prosent av kontoene',
  perMonth: 'Beløp i måneden (etter skatt)',
  percent: 'Prosent i året (før skatt)',
  withdrawalNote:
    'Pensjon og inntekt som kobles inn teller først, pensjon etter skatt og inntekt slik den utbetales. Det som mangler tas fra kontoene etter størrelse, og det som er til overs går videre. En ASK betaler ingen skatt på innskudd og skjermingsfradrag, og deretter skatten på gevinst som står på kontoen. En vanlig konto betaler ingen. Skatt på pensjon følger reglene for 2026, regnet på all pensjonen din samlet. Tar du ut pensjon ved siden av jobb, blir skatten høyere enn det som vises her.',
  homeKind: 'Type',
  primaryHome: 'Primærbolig',
  secondaryHome: 'Sekundærbolig',
  cabin: 'Hytte',
  housingValue: 'Verdi',
  loan: 'Lån',
  paidOff: 'Nedbetalt',
  housingNote:
    'Verdien står fast i dagens kroner, og lånet går jevnt ned til null på datoen. Boksen flytter ingen penger, så renter og avdrag setter du opp i et budsjett eller på annen måte. Typen sier hvor mye den teller i formuesskatten. Trenger ingen connector.',
  wealthAllowance: 'Bunnfradrag',
  wealthRate: 'Sats (%)',
  wealthHighFrom: 'Høyere sats fra',
  wealthHighRate: 'Høyere sats (%)',
  wealthTaxNote:
    'Regnes hver 31. desember av alle kontoer og boliger, med satsene for 2026. En ASK teller 80 % og en vanlig konto 100 %, mens OTP og alderspensjon holdes utenfor. Den betales fra kontoene etter størrelse, med skatt på gevinst fra en ASK, og det de ikke dekker blir stående ubetalt. Skattlegges du sammen med ektefelle, skriver du hele verdiene og dobler bunnfradraget og grensen. Slett boksen for å holde skatten utenfor. Trenger ingen connector.',
  plan: 'Plan',
  closePlan: 'Lukk planen',
  planNote: 'Forventet forløp uten markedssvingninger, i dagens kroner. Pensjon står før skatt og uttak etter skatt, med skatten på egen linje. Beløpene er avrundet.',
  planToAge: (age: number) => `Planen går til ${age} år.`,
  planForYears: (years: number) => `Planen går ${years} år frem.`,
  planEmpty: 'Planen vises når det ligger en konto eller en pensjon på tegneflaten.',
  planPer: {
    daily: 'om dagen',
    weekly: 'i uken',
    monthly: 'i måneden',
    quarterly: 'i kvartalet',
    yearly: 'i året',
    once: 'én gang',
  } satisfies Record<PlanInterval, string>,
  planLines: {
    opening: {
      starts: ({ to, amount }) => `${to} starter med ${amount}`,
      changes: ({ to, amount }) => `${to} starter med ${amount}`,
      stops: ({ to }) => `${to} avsluttes`,
    },
    housing: {
      starts: ({ from, amount, loan }) => (loan ? `${from} er verdt ${amount}, med lån på ${loan}` : `${from} er verdt ${amount}`),
      changes: ({ from, amount, loan }) => (loan ? `${from} er verdt ${amount}, med lån på ${loan}` : `${from} er verdt ${amount}`),
      stops: ({ from }) => `Lånet på ${from} er nedbetalt`,
    },
    deposit: {
      starts: ({ from, to, amount, per }) => `Sett inn ${amount} ${per} fra ${from} til ${to}`,
      changes: ({ from, to, amount, per }) => `Innskudd fra ${from} til ${to} blir ${amount} ${per}`,
      stops: ({ from, to }) => `Innskudd fra ${from} til ${to} stopper`,
    },
    pensionDeposit: {
      starts: ({ to, amount, per }) => `Arbeidsgiver setter inn ${amount} ${per} på ${to}`,
      changes: ({ to, amount, per }) => `Arbeidsgivers innskudd på ${to} blir ${amount} ${per}`,
      stops: ({ to }) => `Arbeidsgivers innskudd på ${to} stopper`,
    },
    pension: {
      starts: ({ from, to, amount, per }) => (to ? `${from} betaler ${amount} ${per} til ${to}` : `${from} betaler ${amount} ${per}`),
      changes: ({ from, amount, per }) => `${from} betaler nå ${amount} ${per}`,
      stops: ({ from }) => `${from} er ferdig utbetalt`,
    },
    withdrawal: {
      starts: ({ from, amount, per }) => `Ta ut ${amount} ${per} fra ${from}`,
      changes: ({ from, amount, per }) => `Uttak fra ${from} blir ${amount} ${per}`,
      stops: ({ from }) => `Uttak fra ${from} stopper`,
    },
    tax: {
      starts: ({ from, amount, per }) => `Skatt på ${from} er ${amount} ${per}`,
      changes: ({ from, amount, per }) => `Skatt på ${from} blir ${amount} ${per}`,
      stops: ({ from }) => `Skatt på ${from} stopper`,
    },
    wealthTax: {
      starts: ({ amount, per }) => `Formuesskatt er ${amount} ${per}`,
      changes: ({ amount, per }) => `Formuesskatt blir ${amount} ${per}`,
      stops: () => 'Formuesskatt stopper',
    },
    wealthTaxGain: {
      starts: ({ amount, per }) => `Skatt på gevinst for å betale formuesskatten er ${amount} ${per}`,
      changes: ({ amount, per }) => `Skatt på gevinst for å betale formuesskatten blir ${amount} ${per}`,
      stops: () => 'Skatt på gevinst for å betale formuesskatten stopper',
    },
    surplus: {
      starts: ({ to, amount, per }) => (to ? `Overskudd på ${amount} ${per} går til ${to}` : `Overskudd på ${amount} ${per} regnes som brukt`),
      changes: ({ to, amount, per }) => (to ? `Overskudd til ${to} blir ${amount} ${per}` : `Overskudd som regnes som brukt blir ${amount} ${per}`),
      stops: ({ to }) => (to ? `Overskudd til ${to} stopper` : 'Overskudd som regnes som brukt stopper'),
    },
    move: {
      starts: ({ from, to, amount, per }) => `Flytt ${amount} ${per} fra ${from} til ${to}`,
      changes: ({ from, to, amount, per }) => `Flytting fra ${from} til ${to} blir ${amount} ${per}`,
      stops: ({ from, to }) => `Flytting fra ${from} til ${to} stopper`,
    },
    unmet: {
      starts: ({ from, amount, per }) => `${from} mangler ${amount} ${per}`,
      changes: ({ from, amount, per }) => `${from} mangler nå ${amount} ${per}`,
      stops: ({ from }) => `${from} er dekket igjen`,
    },
    wealthTaxShort: {
      starts: ({ amount, per }) => `Formuesskatt mangler ${amount} ${per}`,
      changes: ({ amount, per }) => `Formuesskatt mangler nå ${amount} ${per}`,
      stops: () => 'Formuesskatt er dekket igjen',
    },
  } satisfies PlanTexts,
  intervals: {
    daily: 'Daglig',
    tradingDays: 'Børsdager',
    weekly: 'Ukentlig',
    monthly: 'Månedlig',
    quarterly: 'Kvartalsvis',
    yearly: 'Årlig',
  },
  noAccounts: 'Legg til en konto i Inndata-fanen for å starte simuleringen.',
  calculating: 'Regner ut…',
  simulationFailed: 'Simuleringen stoppet på grunn av en feil.',
  somethingWentWrong: 'Noe gikk galt på denne siden. Boksene dine er fortsatt lagret i denne nettleseren. Prøv å laste siden på nytt.',
  simulationPeriod: 'Simuleringsperiode',
  yearsOption: (years: number) => `${years} år`,
  passNumber: (pass: number) => `Pass ${pass}`,
  pause: 'Pause',
  resume: 'Fortsett',
  simulationLegend:
    'Alle beløp er i dagens kroner. De tynne strekene øverst er enkeltpass. Den tykke streken er medianen av alle passene, det indre båndet rommer halvparten av dem og det ytre åtte av ti.',
  spreadAtEnd: (low: string, high: string) => `Åtte av ti pass ender mellom ${low} og ${high}.`,
  depositsLegend: 'Den stiplede streken er det som er igjen av det du har satt inn, så avstanden opp til den tykke streken er avkastningen.',
  shieldLegend: 'Den prikkede streken er ubrukt skjermingsfradrag, som gir lavere skatt på gevinst.',
  withdrawnInTotal: (amount: string) => `Utbetalt til sammen: ${amount}`,
  withdrawnAndTax: (amount: string, tax: string) => `Utbetalt til sammen: ${amount} etter skatt, og ${tax} i skatt`,
  withdrawalsPerMonth: 'Hvor pengene kommer fra, i kroner i måneden etter skatt, med skatten på toppen. Gjennomsnitt av alle passene.',
  otherBoxes: 'Andre',
  need: 'Behov',
  surplus: 'Til overs',
  surplusGoesTo: (name: string) => `Går videre til ${name}`,
  surplusIsSpent: 'Regnes som brukt',
  short: 'Mangler',
  tax: 'Skatt',
  wealthTax: 'Formuesskatt',
  medianAfter: (years: number, amount: string) => `Median etter ${years} år: ${amount}`,
  medianAtAge: (age: number, amount: string) => `Median ved ${age} år: ${amount}`,
  balanceAtAge: (age: number, amount: string) => `Beholdning ved ${age} år: ${amount}`,
  payoutPerYear: (amount: string) => `Utbetalt: ca. ${amount} i året`,
  heldWholePeriod: (share: string) => `${share} av passene holder hele perioden.`,
  heldToAge: (share: string, age: number) => `${share} av passene holder til ${age} år.`,
  gateHeldWholePeriod: (name: string, share: string) => `${name} dekkes hele perioden i ${share} av passene.`,
  gateHeldToAge: (name: string, share: string, age: number) => `${name} dekkes til ${age} år i ${share} av passene.`,
  diagnostics: {
    notConnected: 'Ikke koblet, så den har ingen effekt.',
    transfersExceedIncome: 'Trekkene er til sammen større enn det som utbetales, så de siste får mindre.',
    budgetExceedsIncome: 'Budsjettet er større enn inntekten, så ingenting spares.',
    needsBirthYear: 'Trenger fødselsåret ditt i boksen Deg selv.',
    needsPayoutAge: 'Trenger en alder å utbetale fra.',
    incomeNeverRuns: 'Fra alder er ikke før Til alder, så den utbetaler aldri noe.',
    restGoesOnlyOnce: 'Det som er igjen av en utbetaling kan bare gå ett sted, så bare den første connectoren får det.',
    nothingToDraw: 'Koble til kontoene, pensjonene og inntektene den skal ta fra.',
    surplusIsSpent: 'Pensjon og inntekt utover behovet regnes som brukt. Koble til en konto hvis det skal spares.',
    sameAccount: 'Går tilbake til kontoen det kom fra, så det har ingen effekt.',
    twoPrimaryHomes: 'Du kan bare være folkeregistrert ett sted, så bare én bolig kan være primærbolig.',
  } satisfies Record<DiagnosticCode, string>,
};

export const translations: Record<Language, Translations> = { en, no };

export const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE);

export function useTranslations(): Translations {
  return translations[useContext(LanguageContext)];
}

function readLanguage(): Language {
  const stored = readChoice(STORAGE_KEY);
  return stored === 'no' || stored === 'en' ? stored : DEFAULT_LANGUAGE;
}

export function useLanguage() {
  const [language, setLanguage] = useState(readLanguage);

  // Stored as soon as it is on screen, also before anyone has chosen it, unlike the theme and the plan.
  useEffect(() => {
    document.documentElement.lang = language;
    remember(STORAGE_KEY, language);
  }, [language]);

  return [language, setLanguage] as const;
}
