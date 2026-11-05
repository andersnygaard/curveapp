// Payments split into stretches that belong together: about the same amount, at a steady pace, without a pause. It knows
// nothing of what is paid. The plan says what a payment is, and this only says where one stretch ends and the next begins.
import type { Timeline } from '../engine/timeline';

export type PaymentInterval = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'once';

const MONTHS_BETWEEN: Partial<Record<PaymentInterval, number>> = { monthly: 1, quarterly: 3, yearly: 12 };

// An amount that follows G rises a little every year. That is one stretch, and one line in the plan, not a new one each year.
const CHANGE_SHARE = 0.1;
const SMALLEST_CHANGE = 500;
const LONGEST_GAP_DAYS = 400;
// Trading days have a weekend between them.
const SHORTEST_ALLOWED_GAP_DAYS = 5;
// Room for one payment that did not come.
const SKIPPED_PAYMENT_GAPS = 2.5;

export interface Payment {
  day: number;
  amount: number;
}

// Payments that belong together: about the same amount with no pause.
export interface Stretch {
  firstDay: number;
  lastDay: number;
  gap: number | null;
  first: number;
  last: number;
  payments: number;
}

const allowedGap = (gap: number | null) => (gap === null ? LONGEST_GAP_DAYS : Math.max(gap * 1.5, SHORTEST_ALLOWED_GAP_DAYS));

const aboutTheSame = (amount: number, before: number) => Math.abs(amount - before) <= Math.max(before * CHANGE_SHARE, SMALLEST_CHANGE);

function continues(stretch: Stretch, { day, amount }: Payment, anyAmount: boolean): boolean {
  return day - stretch.lastDay <= allowedGap(stretch.gap) && (anyAmount || aboutTheSame(amount, stretch.last));
}

// The month an account runs out holds what was left in it, and the month a shortfall starts holds a part of it.
// A single payment like that belongs to the stretch next to it, and does not get a date of its own.
function withoutLonePayments(stretches: Stretch[]): Stretch[] {
  const kept: Stretch[] = [];
  stretches.forEach((stretch, index) => {
    const next = stretches[index + 1];
    const previous = kept.at(-1);
    if (stretch.payments === 1 && next && next.firstDay - stretch.lastDay <= allowedGap(next.gap)) {
      next.gap ??= next.firstDay - stretch.lastDay;
      next.firstDay = stretch.firstDay;
      next.payments++;
    } else if (stretch.payments === 1 && previous && stretch.lastDay - previous.lastDay <= allowedGap(previous.gap)) {
      previous.gap ??= stretch.lastDay - previous.lastDay;
      previous.lastDay = stretch.lastDay;
      previous.payments++;
    } else {
      kept.push(stretch);
    }
  });
  return kept;
}

// A yearly income pays for the month it comes, so what is drawn from the accounts is smaller or gone that month, every
// year. A weekly income comes to more in the months with five of them. That is one payment going on, and nothing to plan for.
function withoutSkippedPayments(stretches: Stretch[]): Stretch[] {
  const kept: Stretch[] = [];
  for (const stretch of stretches) {
    const previous = kept.at(-1);
    if (previous?.gap && stretch.firstDay - previous.lastDay <= previous.gap * SKIPPED_PAYMENT_GAPS && aboutTheSame(stretch.first, previous.last)) {
      previous.lastDay = stretch.lastDay;
      previous.last = stretch.last;
      previous.payments += stretch.payments;
    } else {
      kept.push(stretch);
    }
  }
  return kept;
}

export function stretchesOf(payments: Payment[], anyAmount: boolean): Stretch[] {
  const stretches: Stretch[] = [];
  for (const payment of payments) {
    const { day, amount } = payment;
    const current = stretches.at(-1);
    if (current && continues(current, payment, anyAmount)) {
      current.gap ??= day - current.lastDay;
      current.lastDay = day;
      current.last = amount;
      current.payments++;
    } else {
      stretches.push({ firstDay: day, lastDay: day, gap: null, first: amount, last: amount, payments: 1 });
    }
  }
  return withoutSkippedPayments(withoutLonePayments(stretches));
}

export function intervalOf(gap: number | null): PaymentInterval {
  if (gap === null) return 'once';
  if (gap <= SHORTEST_ALLOWED_GAP_DAYS) return 'daily';
  if (gap <= 10) return 'weekly';
  if (gap <= 45) return 'monthly';
  return gap <= 120 ? 'quarterly' : 'yearly';
}

// The day the next payment would have come.
export function dayAfter({ lastDay, gap }: Stretch, every: PaymentInterval, timeline: Timeline): number {
  const months = MONTHS_BETWEEN[every];
  if (months === undefined) return lastDay + (gap ?? 1);
  const date = timeline.dateOf(lastDay);
  return timeline.dayOfMs(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

// The first and last amount of a stretch. Something on one line for long can rise and then fall, and its range must still say
// how high it went. Otherwise the last payment of a pension empties it and is a little different, so only a real rise counts.
export function amountsOf(stretch: Stretch, payments: Payment[], oneLine: boolean): { amount: number; lastAmount: number } {
  if (oneLine) {
    const amounts = payments.filter(({ day }) => day >= stretch.firstDay && day <= stretch.lastDay).map(({ amount }) => amount);
    return { amount: Math.min(...amounts), lastAmount: Math.max(...amounts) };
  }
  const rises = Math.abs(stretch.last - stretch.first) > stretch.first * CHANGE_SHARE;
  return { amount: stretch.first, lastAmount: rises ? stretch.last : stretch.first };
}
