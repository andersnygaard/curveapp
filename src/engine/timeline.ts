export const DAY_MS = 86_400_000;
export const DAYS_PER_YEAR = 365.25;

export type Interval = 'daily' | 'tradingDays' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

interface Window {
  from?: number;
  until?: number;
}

// The one answer to "when does this happen?". Pay days, start and end ages and one-off events are all this.
export type Schedule =
  | ({ every: Interval; at?: 'periodStart' | 'periodEnd' } & Window)
  | ({ annually: { month: number; day: number } } & Window)
  | { once: number };

function firesOn(interval: Interval, date: Date): boolean {
  const weekday = date.getUTCDay();
  const dayOfMonth = date.getUTCDate();
  const month = date.getUTCMonth();
  switch (interval) {
    case 'daily':
      return true;
    case 'tradingDays':
      return weekday >= 1 && weekday <= 5;
    case 'weekly':
      return weekday === 1;
    case 'monthly':
      return dayOfMonth === 1;
    case 'quarterly':
      return dayOfMonth === 1 && month % 3 === 0;
    case 'yearly':
      return dayOfMonth === 1 && month === 0;
  }
}

export class Timeline {
  readonly startMs: number;
  readonly days: number;
  private readonly firings = new Map<string, Uint8Array>();
  private years?: Uint16Array;

  constructor(startMs: number, days: number) {
    this.startMs = startMs;
    this.days = days;
  }

  // A box date is a calendar date written as 'YYYY-MM-DD', which Date.parse reads as midnight UTC. All the arithmetic
  // here is in UTC too, so no day is 23 or 25 hours long. The rounding in dayOfMs takes care of a date read in local
  // time, which is off by less than half a day.
  dayOf(date: string): number {
    return this.dayOfMs(Date.parse(date));
  }

  dayOfMs(ms: number): number {
    return Math.round((ms - this.startMs) / DAY_MS);
  }

  dateOf(day: number): Date {
    return new Date(this.startMs + day * DAY_MS);
  }

  // Calendar years since the start, so a year of monthly payments always holds twelve of them. Every recorded amount
  // asks for it, so it is worked out once for the whole period.
  yearIndex(day: number): number {
    if (day < 0 || day > this.days) return this.yearOf(day);
    this.years ??= Uint16Array.from({ length: this.days + 1 }, (_, at) => this.yearOf(at));
    return this.years[day];
  }

  private yearOf(day: number): number {
    return this.dateOf(day).getUTCFullYear() - this.dateOf(0).getUTCFullYear();
  }

  fires(schedule: Schedule): Uint8Array {
    const key = JSON.stringify(schedule);
    let days = this.firings.get(key);
    if (!days) {
      days = new Uint8Array(this.days + 1);
      for (let day = 0; day <= this.days; day++) days[day] = this.isDue(schedule, day) ? 1 : 0;
      this.firings.set(key, days);
    }
    return days;
  }

  private isDue(schedule: Schedule, day: number): boolean {
    if ('once' in schedule) return day === schedule.once;
    if (day < (schedule.from ?? 0) || day >= (schedule.until ?? Infinity)) return false;
    if ('annually' in schedule) {
      const date = this.dateOf(day);
      return date.getUTCMonth() === schedule.annually.month && date.getUTCDate() === schedule.annually.day;
    }
    return firesOn(schedule.every, this.dateOf(day + (schedule.at === 'periodEnd' ? 1 : 0)));
  }
}

// Years since the previous firing, for each day. A shock over three days is larger than one over a single day.
export function yearsSinceLast(fires: Uint8Array): Float64Array {
  const gaps = new Float64Array(fires.length);
  let last = -1;
  for (let day = 0; day < fires.length; day++) {
    if (!fires[day]) continue;
    gaps[day] = (day - last) / DAYS_PER_YEAR;
    last = day;
  }
  return gaps;
}
