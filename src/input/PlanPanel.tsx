import { useTranslations, type Translations } from '../i18n';
import type { Plan, PlanBalance, PlanDate, PlanLine } from '../model/plan';
import type { SimulationInput } from '../model/types';
import { usePlan } from '../simulation/usePlan';

const ROUND_PAYMENTS_TO = 100;
const BALANCE_DIGITS = 3;

function paymentText(t: Translations, { amount, lastAmount, currency }: PlanLine): string {
  const format = new Intl.NumberFormat(t.locale, { style: 'currency', currency, maximumFractionDigits: 0 });
  const [low, high] = [amount, lastAmount].map((value) => Math.round(value / ROUND_PAYMENTS_TO) * ROUND_PAYMENTS_TO).sort((a, b) => a - b);
  return low === high ? format.format(low) : format.formatRange(low, high);
}

function balanceText(t: Translations, { name, amount, currency }: PlanBalance): string {
  const format = new Intl.NumberFormat(t.locale, { style: 'currency', currency, maximumSignificantDigits: BALANCE_DIGITS });
  return `${name} ${format.format(amount)}`;
}

function lineText(t: Translations, line: PlanLine): string {
  const { flow, change, from, to, every } = line;
  return t.planLines[flow][change]({
    from: from ?? '',
    to: to ?? '',
    amount: paymentText(t, line),
    per: t.planPer[every],
  });
}

function DateSection({ date }: { date: PlanDate }) {
  const t = useTranslations();
  const format = new Intl.DateTimeFormat(t.locale, { dateStyle: 'medium', timeZone: 'UTC' });
  return (
    <section className="plan-date">
      <h3 className="plan-when">
        <time dateTime={new Date(date.dateMs).toISOString().slice(0, 10)}>{format.format(date.dateMs)}</time>
        {date.age !== null && <span className="plan-age">{t.ageTick(date.age)}</span>}
      </h3>
      <ul className="plan-lines">
        {date.lines.map((line, index) => (
          <li key={index} className={line.flow === 'unmet' && line.change !== 'stops' ? 'plan-short' : undefined}>
            {lineText(t, line)}
          </li>
        ))}
      </ul>
      {date.balances.length > 0 && (
        <p className="plan-balances">{date.balances.map((balance) => balanceText(t, balance)).join(' · ')}</p>
      )}
    </section>
  );
}

export default function PlanPanel({ input }: { input: SimulationInput }) {
  const { plan, failed } = usePlan(input);
  return <PlanView plan={plan} failed={failed} />;
}

// What the panel shows, given the plan. It works nothing out, so it can be tested with fixed numbers.
export function PlanView({ plan, failed }: { plan: Plan | null; failed: boolean }) {
  const t = useTranslations();

  return (
    <aside className="plan" aria-label={t.plan}>
      <h2 className="plan-title">{t.plan}</h2>
      {failed && <p className="plan-note">{t.simulationFailed}</p>}
      {!failed && !plan && <p className="plan-note">{t.calculating}</p>}
      {!failed && plan && plan.dates.length === 0 && <p className="plan-note">{t.planEmpty}</p>}
      {!failed && plan && plan.dates.length > 0 && (
        <>
          <p className="plan-note">
            {t.planNote} {plan.toAge !== null ? t.planToAge(plan.toAge) : t.planForYears(plan.years)}
          </p>
          {plan.dates.map((date) => (
            <DateSection key={date.day} date={date} />
          ))}
        </>
      )}
    </aside>
  );
}
