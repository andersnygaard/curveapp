// The ways an amount is written on screen. An Intl format is slow to make, so each one is made once for a language
// and a currency, and then kept.
const made = new Map<string, Intl.NumberFormat>();

function kept(key: string, make: () => Intl.NumberFormat): Intl.NumberFormat {
  let format = made.get(key);
  if (!format) {
    format = make();
    made.set(key, format);
  }
  return format;
}

// Whole kroner, with the currency.
export const moneyFormat = (locale: string, currency: string) =>
  kept(`money ${locale} ${currency}`, () => new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }));

// Short, for the marks along an axis.
export const compactFormat = (locale: string) =>
  kept(`compact ${locale}`, () => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }));

// Whole numbers without a currency, as on the box cards.
export const amountFormat = (locale: string) =>
  kept(`amount ${locale}`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }));

// A share as a percent. Rounded down, so 100 % means that every single pass held.
export function shareDown(locale: string): { format: (share: number) => string } {
  const percent = kept(`percent ${locale}`, () => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }));
  return { format: (share) => percent.format(Math.floor(share * 100) / 100) };
}
