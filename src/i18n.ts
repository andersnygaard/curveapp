import { createContext, useEffect, useState } from 'react';

export type Language = 'no' | 'en';

const STORAGE_KEY = 'curve.language';
const DEFAULT_LANGUAGE: Language = 'en';

export const translations = {
  en: {
    language: 'Language',
    sections: 'Sections',
    simulation: 'Simulation',
    input: 'Input',
    privacyStatement: 'Privacy statement',
    locale: 'en-GB',
    income: 'Income',
    transfer: 'Transfer',
    account: 'Account',
    pension: 'National pension',
    otp: 'Occupational pension',
    g: 'G (base amount)',
    me: 'You',
    birthYear: 'Birth year',
    meNote: 'Shows your age on the graphs. Needs no connector.',
    toAge95: 'To age 95',
    ageTick: (age: number) => `${age} yrs`,
    expectedAtAge: (age: number, amount: string) => `Expected at age ${age}: ${amount}`,
    addBox: (type: 'income' | 'transfer' | 'account' | 'otp' | 'pension') =>
      ({
        income: 'Add income',
        transfer: 'Add transfer',
        account: 'Add account',
        otp: 'Add occupational pension',
        pension: 'Add national pension',
      })[type],
    deleteBox: (name: string) => `Delete ${name}`,
    deleteConnector: 'Delete connector',
    inputHelp:
      'Drag from the dot on the right of a box to the dot on the left of the next one. Income connects to transfer, occupational pension or national pension, and transfer to account.',
    name: 'Name',
    amount: 'Amount',
    interval: 'Interval',
    startAmount: 'Start amount',
    startDate: 'Start date',
    currency: 'Currency',
    annualReturn: 'Real annual return (%)',
    returnInterval: 'Return interval',
    standardDeviation: 'Standard deviation (%)',
    balance: 'Balance',
    date: 'Date',
    accountType: 'Account type',
    regularAccount: 'Regular',
    askAccount: 'ASK',
    taxRate: 'Tax on gains (%)',
    inflation: 'Inflation (%)',
    afterTaxIfWithdrawn: (amount: string) => `After tax if everything is withdrawn: ${amount}`,
    gValue: 'G (NOK)',
    gGrowth: 'Expected G growth (%)',
    gNote: 'Used by occupational and national pension. Needs no connector. Growth means growth above inflation.',
    lowRate: 'Rate up to 7.1 G (%)',
    highRate: 'Rate 7.1 to 12 G (%)',
    calculatedBalance: 'Calculated balance, not money. Do not add it to your savings.',
    daily: 'Daily',
    tradingDays: 'Trading days',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
    noAccounts: 'Add an account in the Input tab to start the simulation.',
    simulationPeriod: 'Simulation period',
    yearsOption: (years: number) => `${years} years`,
    passNumber: (pass: number) => `Pass ${pass}`,
    pause: 'Pause',
    resume: 'Resume',
    simulationLegend:
      "All amounts are in today's money. The thick line is the expected path. The thin lines are possible deviations.",
    expectedAfter: (years: number, amount: string) => `Expected after ${years} years: ${amount}`,
  },
  no: {
    language: 'Språk',
    sections: 'Visninger',
    simulation: 'Simulering',
    input: 'Inndata',
    privacyStatement: 'Personvernerklæring',
    locale: 'nb-NO',
    income: 'Inntekt',
    transfer: 'Trekk',
    account: 'Konto',
    pension: 'Folketrygden',
    otp: 'Tjenestepensjon (OTP)',
    g: 'G (grunnbeløpet)',
    me: 'Deg selv',
    birthYear: 'Fødselsår',
    meNote: 'Viser alderen din på grafene. Trenger ingen connector.',
    toAge95: 'Til 95 år',
    ageTick: (age: number) => `${age} år`,
    expectedAtAge: (age: number, amount: string) => `Forventet ved ${age} år: ${amount}`,
    addBox: (type: 'income' | 'transfer' | 'account' | 'otp' | 'pension') =>
      ({
        income: 'Legg til inntekt',
        transfer: 'Legg til trekk',
        account: 'Legg til konto',
        otp: 'Legg til OTP',
        pension: 'Legg til folketrygd',
      })[type],
    deleteBox: (name: string) => `Slett ${name}`,
    deleteConnector: 'Slett connector',
    inputHelp:
      'Dra fra prikken til høyre på en boks til prikken til venstre på den neste. Inntekt kobles til trekk, OTP eller folketrygd, og trekk til konto.',
    name: 'Navn',
    amount: 'Beløp',
    interval: 'Intervall',
    startAmount: 'Startbeløp',
    startDate: 'Startdato',
    currency: 'Valuta',
    annualReturn: 'Årlig realavkastning (%)',
    returnInterval: 'Avkastningsintervall',
    standardDeviation: 'Standardavvik (%)',
    balance: 'Beholdning',
    date: 'Dato',
    accountType: 'Type',
    regularAccount: 'Vanlig',
    askAccount: 'ASK',
    taxRate: 'Skatt på gevinst (%)',
    inflation: 'Inflasjon (%)',
    afterTaxIfWithdrawn: (amount: string) => `Etter skatt hvis alt tas ut: ${amount}`,
    gValue: 'G (kr)',
    gGrowth: 'Forventet G-vekst (%)',
    gNote: 'Brukes av OTP og Folketrygden. Trenger ingen connector. Veksten er reallønnsvekst, altså utover prisveksten.',
    lowRate: 'Sats opp til 7,1 G (%)',
    highRate: 'Sats 7,1 til 12 G (%)',
    calculatedBalance: 'Beregnet beholdning, ikke penger. Ikke legg den sammen med sparingen din.',
    daily: 'Daglig',
    tradingDays: 'Børsdager',
    weekly: 'Ukentlig',
    monthly: 'Månedlig',
    quarterly: 'Kvartalsvis',
    yearly: 'Årlig',
    noAccounts: 'Legg til en konto i Inndata-fanen for å starte simuleringen.',
    simulationPeriod: 'Simuleringsperiode',
    yearsOption: (years: number) => `${years} år`,
    passNumber: (pass: number) => `Pass ${pass}`,
    pause: 'Pause',
    resume: 'Fortsett',
    simulationLegend:
      'Alle beløp er i dagens kroner. Den tykke streken er forventet utvikling. De tynne strekene er mulige avvik.',
    expectedAfter: (years: number, amount: string) => `Forventet etter ${years} år: ${amount}`,
  },
};

export const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE);

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
