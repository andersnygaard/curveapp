import { createContext, useContext, useEffect, useState } from 'react';
import type { AddableType } from './model/catalog';
import type { PlanChange, PlanFlow, PlanInterval } from './model/plan';
import type { DiagnosticCode } from './model/spec';
import type { DefaultNames } from './model/types';

export type Language = 'no' | 'en';

interface PlanLineParts {
  from: string;
  to: string;
  amount: string;
  per: string;
}

type PlanTexts = Record<PlanFlow, Record<PlanChange, (parts: PlanLineParts) => string>>;

const STORAGE_KEY = 'curve.language';
const DEFAULT_LANGUAGE: Language = 'no';

const defaultNames: Record<Language, DefaultNames> = {
  en: {
    income: 'Salary',
    transfer: 'Savings',
    budget: 'Budget',
    budgetHousing: 'Housing',
    budgetLiving: 'Food and living',
    account: 'Fund',
    return: 'Stock market',
    otp: 'OTP',
    folketrygd: 'National pension',
    withdrawal: 'Withdrawal',
  },
  no: {
    income: 'Lønn',
    transfer: 'Sparetrekk',
    budget: 'Budsjett',
    budgetHousing: 'Bolig',
    budgetLiving: 'Mat og forbruk',
    account: 'Fond',
    return: 'Aksjemarkedet',
    otp: 'OTP',
    folketrygd: 'Folketrygden',
    withdrawal: 'Uttak',
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
  { no: 'Ny linje', en: 'New line' },
];

// What a box is called in the other language, for the names that are the same word.
export function wordsBetween(from: Language, to: Language): [string, string][] {
  if (from === to) return [];
  const keys = Object.keys(defaultNames.no) as (keyof DefaultNames)[];
  const words = [...keys.map((key) => ({ no: defaultNames.no[key], en: defaultNames.en[key] })), ...moreNames];
  return words.filter((word) => word.no !== word.en).map((word) => [word[from], word[to]]);
}

export const translations = {
  en: {
    language: 'Language',
    saveFile: 'Save',
    saveFileHint: 'Save the setup as a file',
    loadFile: 'Load',
    loadFileHint: 'Load a setup from a file',
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
        text: 'The Simulation tab shows where the money comes from each year, and then each account, where the thick line is the median and the thin lines are single passes. Here you choose how far ahead to look.',
      },
    },
    sections: 'Sections',
    simulation: 'Simulation',
    input: 'Input',
    privacyStatement: 'Privacy statement',
    locale: 'en-GB',
    defaultNames: defaultNames.en,
    income: 'Income',
    transfer: 'Transfer',
    budget: 'Budget',
    account: 'Account',
    return: 'Return',
    otp: 'Occupational pension',
    folketrygd: 'National pension',
    withdrawal: 'Withdrawal',
    g: 'G (base amount)',
    me: 'You',
    birthYear: 'Birth year',
    retirementAge: 'Stops working at age',
    meNote: 'Shows your age on the graphs and sets when income stops. Needs no connector.',
    toAge95: 'To age 95',
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
    } satisfies Record<AddableType, string>,
    deleteBox: (name: string) => `Delete ${name}`,
    deleteConnector: 'Delete connector',
    inputHelp:
      'Drag from a dot to a dot of the same shape. Money flows left to right, return comes in from above, and salary gives occupational and national pension their basis.',
    wireMoney: 'Money',
    wireInfluence: 'Influence',
    wireBasis: 'Basis',
    storageRecovered: 'Your saved boxes could not be read, so this is the default setup. A copy is kept in this browser.',
    name: 'Name',
    amount: 'Amount',
    netPay: 'Paid out (after tax)',
    pensionBasis: 'Pension basis (a year)',
    stopsAtRetirement: 'Stops when you stop working',
    interval: 'Interval',
    startAmount: 'Start amount',
    startDate: 'Start date',
    currency: 'Currency',
    annualReturn: 'Real annual return (%)',
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
    lowRate: 'Rate up to 7.1 G (%)',
    highRate: 'Rate 7.1 to 12 G (%)',
    payoutAge: 'Paid out from age',
    payoutYears: 'Years of payout',
    divisor: 'Divisor',
    calculatedBalance: 'Calculated balance, not money. Do not add it to your savings.',
    budgetLineName: 'Line name',
    budgetLineAmount: 'Amount a month',
    addBudgetLine: 'Add line',
    newBudgetLine: 'New line',
    deleteBudgetLine: (name: string) => `Delete ${name}`,
    budgetSum: 'Total a month',
    budgetLeft: 'Left to save a month',
    startAge: 'From age',
    withdrawalMode: 'Set as',
    modeAmount: 'Amount a month',
    modePercent: 'Percent of the accounts',
    perMonth: 'Amount a month (after tax)',
    percent: 'Percent a year (before tax)',
    pensionTax: 'Tax on pension (%)',
    withdrawalNote:
      'Pension wired in counts first, after tax. What is missing comes from the accounts by size, and any surplus goes on. An ASK pays no tax on deposits and shielding, and then the tax on gains set on the account. A regular account pays none.',
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
    } satisfies PlanTexts,
    daily: 'Daily',
    tradingDays: 'Trading days',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
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
      "All amounts are in today's money. The thick line is the median of all the passes. The thin lines are single passes.",
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
      restGoesOnlyOnce: 'What is left of a payment can only go one way, so only the first connector gets it.',
      nothingToDraw: 'Connect the accounts and pensions it should draw from.',
      surplusIsSpent: 'Pension beyond the need counts as spent. Connect an account if it should be saved.',
      sameAccount: 'Goes back to the account it came from, so it has no effect.',
    } satisfies Record<DiagnosticCode, string>,
  },
  no: {
    language: 'Språk',
    saveFile: 'Lagre',
    saveFileHint: 'Lagre oppsettet som fil',
    loadFile: 'Last inn',
    loadFileHint: 'Last inn et oppsett fra fil',
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
        text: 'Simulering-fanen viser hvor pengene kommer fra hvert år, og deretter hver konto, der den tykke streken er medianen og de tynne strekene er enkeltpass. Her velger du hvor langt frem du vil se.',
      },
    },
    sections: 'Visninger',
    simulation: 'Simulering',
    input: 'Inndata',
    privacyStatement: 'Personvernerklæring',
    locale: 'nb-NO',
    defaultNames: defaultNames.no,
    income: 'Inntekt',
    transfer: 'Trekk',
    budget: 'Budsjett',
    account: 'Konto',
    return: 'Avkastning',
    otp: 'Tjenestepensjon (OTP)',
    folketrygd: 'Folketrygden',
    withdrawal: 'Uttak',
    g: 'G (grunnbeløpet)',
    me: 'Deg selv',
    birthYear: 'Fødselsår',
    retirementAge: 'Slutter å jobbe ved',
    meNote: 'Viser alderen din på grafene og bestemmer når inntekt stopper. Trenger ingen connector.',
    toAge95: 'Til 95 år',
    ageTick: (age: number) => `${age} år`,
    addBox: {
      income: 'Legg til inntekt',
      transfer: 'Legg til trekk',
      budget: 'Legg til budsjett',
      account: 'Legg til konto',
      return: 'Legg til avkastning',
      otp: 'Legg til OTP',
      folketrygd: 'Legg til folketrygd',
      withdrawal: 'Legg til uttak',
    } satisfies Record<AddableType, string>,
    deleteBox: (name: string) => `Slett ${name}`,
    deleteConnector: 'Slett connector',
    inputHelp:
      'Dra fra en prikk til en prikk med samme form. Penger går fra venstre mot høyre, avkastning kommer ovenfra, og lønn gir OTP og Folketrygden grunnlaget deres.',
    wireMoney: 'Penger',
    wireInfluence: 'Påvirkning',
    wireBasis: 'Grunnlag',
    storageRecovered: 'De lagrede boksene dine kunne ikke leses, så dette er standardoppsettet. En kopi er tatt vare på i denne nettleseren.',
    name: 'Navn',
    amount: 'Beløp',
    netPay: 'Netto utbetalt',
    pensionBasis: 'Pensjonsgrunnlag (i året)',
    stopsAtRetirement: 'Stopper når du slutter å jobbe',
    interval: 'Intervall',
    startAmount: 'Startbeløp',
    startDate: 'Startdato',
    currency: 'Valuta',
    annualReturn: 'Årlig realavkastning (%)',
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
    gNote: 'Brukes av OTP og Folketrygden. Trenger ingen connector. Veksten er reallønnsvekst, altså utover prisveksten.',
    lowRate: 'Sats opp til 7,1 G (%)',
    highRate: 'Sats 7,1 til 12 G (%)',
    payoutAge: 'Utbetaling fra alder',
    payoutYears: 'Antall år',
    divisor: 'Delingstall',
    calculatedBalance: 'Beregnet beholdning, ikke penger. Ikke legg den sammen med sparingen din.',
    budgetLineName: 'Navn på linje',
    budgetLineAmount: 'Beløp i måneden',
    addBudgetLine: 'Legg til linje',
    newBudgetLine: 'Ny linje',
    deleteBudgetLine: (name: string) => `Slett ${name}`,
    budgetSum: 'Sum i måneden',
    budgetLeft: 'Til overs i måneden',
    startAge: 'Fra alder',
    withdrawalMode: 'Angis som',
    modeAmount: 'Beløp i måneden',
    modePercent: 'Prosent av kontoene',
    perMonth: 'Beløp i måneden (etter skatt)',
    percent: 'Prosent i året (før skatt)',
    pensionTax: 'Skatt på pensjon (%)',
    withdrawalNote:
      'Pensjon som kobles inn teller først, etter skatt. Det som mangler tas fra kontoene etter størrelse, og det som er til overs går videre. En ASK betaler ingen skatt på innskudd og skjermingsfradrag, og deretter skatten på gevinst som står på kontoen. En vanlig konto betaler ingen.',
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
    } satisfies PlanTexts,
    daily: 'Daglig',
    tradingDays: 'Børsdager',
    weekly: 'Ukentlig',
    monthly: 'Månedlig',
    quarterly: 'Kvartalsvis',
    yearly: 'Årlig',
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
      'Alle beløp er i dagens kroner. Den tykke streken er medianen av alle passene. De tynne strekene er enkeltpass.',
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
      restGoesOnlyOnce: 'Det som er igjen av en utbetaling kan bare gå ett sted, så bare den første connectoren får det.',
      nothingToDraw: 'Koble til kontoene og pensjonene den skal ta fra.',
      surplusIsSpent: 'Pensjon utover behovet regnes som brukt. Koble til en konto hvis det skal spares.',
      sameAccount: 'Går tilbake til kontoen det kom fra, så det har ingen effekt.',
    } satisfies Record<DiagnosticCode, string>,
  },
};

export type Translations = (typeof translations)[Language];

export const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE);

export function useTranslations(): Translations {
  return translations[useContext(LanguageContext)];
}

function readLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'no' || stored === 'en' ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function useLanguage() {
  const [language, setLanguage] = useState(readLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // Storage can be blocked. The choice then lasts until the page is reloaded.
    }
  }, [language]);

  return [language, setLanguage] as const;
}
