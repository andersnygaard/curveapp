import AccountChart from '../components/AccountChart';
import WithdrawalsChart from '../components/WithdrawalsChart';
import type { StockSummary, WithdrawalSummary } from '../engine/statistics';
import { DAY_MS } from '../engine/timeline';
import { useTranslations } from '../i18n';
import { DEFAULT_YEARS, LAST_AGE } from '../model/compile';
import type { Player } from './player';

const HORIZONS = [5, 10, 20, 30];

export type Horizon = number | 'lastAge';

// "To age 95" needs a birth year. Without one it falls back to the default period.
export function yearsOf(horizon: Horizon, yearsToLastAge: number): number {
  if (horizon !== 'lastAge') return horizon;
  return yearsToLastAge > 0 ? yearsToLastAge : DEFAULT_YEARS;
}

interface Props {
  hasAccounts: boolean;
  failed: boolean;
  player: Player | null;
  birthYear: number | null;
  yearsToLastAge: number;
  horizon: Horizon;
  onHorizon: (horizon: Horizon) => void;
  paused: boolean;
  onTogglePause: () => void;
  registerDraw: (draw: () => void) => () => void;
}

// What the simulation tab shows, given the numbers. It starts no simulation, so it can be tested with fixed ones.
export default function SimulationView({
  hasAccounts,
  failed,
  player,
  birthYear,
  yearsToLastAge,
  horizon,
  onHorizon,
  paused,
  onTogglePause,
  registerDraw,
}: Props) {
  const t = useTranslations();

  if (!hasAccounts) return <p className="sim-empty">{t.noAccounts}</p>;
  if (failed) return <p className="sim-empty">{t.simulationFailed}</p>;
  if (!player) return <p className="sim-empty">{t.calculating}</p>;

  const canReachLastAge = yearsToLastAge > 0;
  const showingLastAge = horizon === 'lastAge' && canReachLastAge;
  const years = yearsOf(horizon, yearsToLastAge);
  // The text follows the passes on screen, also in the moment before a new run has its first picture.
  const toLastAge = player.years === yearsToLastAge && horizon === 'lastAge';
  const percentFormat = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0 });
  // Rounded down, so 100 % means that every single pass held.
  const percent = (share: number) => percentFormat.format(Math.floor(share * 100) / 100);
  const ageAt = (day: number) =>
    new Date(player.layout.startMs + day * DAY_MS).getUTCFullYear() - (birthYear ?? 0);

  function headlineOf(stock: StockSummary, money: Intl.NumberFormat): string {
    const amount = money.format(stock.lastValue);
    if (stock.closeDay !== null && stock.closeDay < player!.layout.totalDays) {
      return t.balanceAtAge(ageAt(stock.closeDay), amount);
    }
    return toLastAge ? t.medianAtAge(LAST_AGE, amount) : t.medianAfter(player!.years, amount);
  }

  function withdrawalSection(withdrawal: WithdrawalSummary) {
    const money = new Intl.NumberFormat(t.locale, { style: 'currency', currency: withdrawal.currency, maximumFractionDigits: 0 });
    return (
      <section key={withdrawal.id} className="withdrawal">
        <div className="chart-heading">
          <h2 className="chart-name">{withdrawal.name}</h2>
          <span className="chart-headline">
            {withdrawal.taxPaid > 0
              ? t.withdrawnAndTax(money.format(withdrawal.withdrawn), money.format(withdrawal.taxPaid))
              : t.withdrawnInTotal(money.format(withdrawal.withdrawn))}
          </span>
        </div>
        <WithdrawalsChart
          title={t.withdrawalsPerMonth}
          labels={{
            other: t.otherBoxes,
            need: t.need,
            surplus: t.surplus,
            surplusGoesOn: withdrawal.surplusTo === null ? t.surplusIsSpent : t.surplusGoesTo(withdrawal.surplusTo),
            short: t.short,
            tax: t.tax,
          }}
          yearEdges={withdrawal.yearEdges}
          sources={withdrawal.sources}
          need={withdrawal.need}
          surplus={withdrawal.surplus}
          short={withdrawal.short}
          tax={withdrawal.tax}
          yMax={withdrawal.perMonthMax}
          startMs={player!.layout.startMs}
          totalDays={player!.layout.totalDays}
          birthYear={birthYear}
          locale={t.locale}
          currency={withdrawal.currency}
          ageLabel={t.ageTick}
        />
      </section>
    );
  }

  return (
    <div className="sim">
      <div className="sim-toolbar">
        <div className="horizons" role="group" aria-label={t.simulationPeriod}>
          {HORIZONS.map((option) => (
            <button
              key={option}
              type="button"
              className="horizon"
              aria-pressed={!showingLastAge && option === years}
              onClick={() => onHorizon(option)}
            >
              {t.yearsOption(option)}
            </button>
          ))}
          {canReachLastAge && (
            <button
              type="button"
              className="horizon"
              aria-pressed={showingLastAge}
              onClick={() => onHorizon('lastAge')}
            >
              {t.toAge95}
            </button>
          )}
        </div>
        <div className="sim-status">
          <span>{t.passNumber(player.completed + 1)}</span>
          <button type="button" className="sim-pause" onClick={onTogglePause}>
            {paused ? t.resume : t.pause}
          </button>
        </div>
      </div>

      {player.summary.gates.map((gate) => (
        <p key={gate.id} className="sim-gate">
          {toLastAge
            ? t.gateHeldToAge(gate.name, percent(gate.heldShare), LAST_AGE)
            : t.gateHeldWholePeriod(gate.name, percent(gate.heldShare))}
        </p>
      ))}

      {player.summary.withdrawals.map(withdrawalSection)}

      <p className="sim-legend">{t.simulationLegend}</p>

      {player.summary.stocks.map((stock, index) => {
        const money = new Intl.NumberFormat(t.locale, {
          style: 'currency',
          currency: stock.currency,
          maximumFractionDigits: 0,
        });
        const headline = headlineOf(stock, money);
        return (
          <section key={stock.id} className="chart">
            <div className="chart-heading">
              <h2 className="chart-name">{stock.name}</h2>
              <span className="chart-headline">{headline}</span>
            </div>
            {stock.calculated && <p className="chart-note">{t.calculatedBalance}</p>}
            {stock.payoutPerYear !== null && (
              <p className="chart-note">{t.payoutPerYear(money.format(stock.payoutPerYear))}</p>
            )}
            {stock.heldShare !== null && (
              <p className="chart-note">
                {toLastAge
                  ? t.heldToAge(percent(stock.heldShare), LAST_AGE)
                  : t.heldWholePeriod(percent(stock.heldShare))}
              </p>
            )}
            {stock.afterTax !== null && <p className="chart-note">{t.afterTaxIfWithdrawn(money.format(stock.afterTax))}</p>}
            {stock.deposits && <p className="chart-note">{t.depositsLegend}</p>}
            {stock.shield && <p className="chart-note">{t.shieldLegend}</p>}
            <AccountChart
              player={player}
              index={index}
              locale={t.locale}
              birthYear={birthYear}
              ageLabel={t.ageTick}
              description={`${stock.name}. ${headline}`}
              registerDraw={registerDraw}
            />
          </section>
        );
      })}
    </div>
  );
}
