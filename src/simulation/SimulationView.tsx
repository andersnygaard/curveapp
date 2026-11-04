import AccountChart from '../components/AccountChart';
import Aurora from '../components/Aurora';
import PeriodScale, { type PeriodOption } from '../components/PeriodScale';
import WithdrawalsChart from '../components/WithdrawalsChart';
import { lastFinite, type Summary, type StockSummary, type WithdrawalSummary } from '../engine/statistics';
import { DAY_MS } from '../engine/timeline';
import { useTranslations } from '../i18n';
import { DEFAULT_YEARS, LAST_AGE } from '../model/compile';
import type { Player } from './player';

const HORIZONS = [5, 10, 20, 30];

export type Horizon = number | 'lastAge';

type GateSummary = Summary['gates'][number];

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

  const moneyIn = (currency: string) =>
    new Intl.NumberFormat(t.locale, { style: 'currency', currency, maximumFractionDigits: 0 });

  function headlineOf(stock: StockSummary, money: Intl.NumberFormat): string {
    const amount = money.format(stock.lastValue);
    if (stock.closeDay !== null && stock.closeDay < player!.layout.totalDays) {
      return t.balanceAtAge(ageAt(stock.closeDay), amount);
    }
    return toLastAge ? t.medianAtAge(LAST_AGE, amount) : t.medianAfter(player!.years, amount);
  }

  function withdrawalSection(withdrawal: WithdrawalSummary) {
    const money = moneyIn(withdrawal.currency);
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
            wealthTax: t.wealthTax,
          }}
          yearEdges={withdrawal.yearEdges}
          sources={withdrawal.sources}
          need={withdrawal.need}
          surplus={withdrawal.surplus}
          short={withdrawal.short}
          tax={withdrawal.tax}
          wealthTax={withdrawal.wealthTax}
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

  // What the bands show, for those who cannot see them. Bands with no width have nothing to say.
  function spreadSentence({ spread }: StockSummary, money: Intl.NumberFormat): string {
    const low = money.format(lastFinite(spread.p10));
    const high = money.format(lastFinite(spread.p90));
    return low === high ? '' : ` ${t.spreadAtEnd(low, high)}`;
  }

  const gateSentence = (gate: GateSummary) =>
    toLastAge
      ? t.gateHeldToAge(gate.name, percent(gate.heldShare), LAST_AGE)
      : t.gateHeldWholePeriod(gate.name, percent(gate.heldShare));

  // The first account behind the headline, since a pension that is only calculated or paid out says less about the plan.
  const { stocks, gates } = player.summary;
  const heroIndex = Math.max(0, stocks.findIndex((stock) => !stock.calculated && stock.closeDay === null));
  const heroStock = stocks[heroIndex] as StockSummary | undefined;
  const heroMedian = heroStock && `${heroStock.name}. ${headlineOf(heroStock, moneyIn(heroStock.currency))}.`;
  const [firstGate, ...otherGates] = gates;

  const periods: PeriodOption[] = [
    ...HORIZONS.map((option) => ({
      id: String(option),
      label: t.yearsOption(option),
      years: option,
      chosen: !showingLastAge && option === years,
      onChoose: () => onHorizon(option),
    })),
    ...(canReachLastAge
      ? [{ id: 'lastAge', label: t.toAge95, years: yearsToLastAge, chosen: showingLastAge, onChoose: () => onHorizon('lastAge') }]
      : []),
  ];

  return (
    <>
      <section className="sim-hero">
        {heroStock && <Aurora player={player} index={heroIndex} registerDraw={registerDraw} />}
        <div className="sim-hero-content">
          <h2 className="sim-headline">{firstGate ? gateSentence(firstGate) : heroMedian}</h2>
          <div className="sim-toolbar">
            <PeriodScale label={t.simulationPeriod} options={periods} />
            <div className="sim-status">
              <span>{t.passNumber(player.completed + 1)}</span>
              <button type="button" className="sim-pause" onClick={onTogglePause}>
                {paused ? t.resume : t.pause}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="sim">
        <p className="sim-legend">
          {firstGate && heroMedian && `${heroMedian} `}
          {t.simulationLegend}
        </p>

        {otherGates.map((gate) => (
          <p key={gate.id} className="sim-gate">
            {gateSentence(gate)}
          </p>
        ))}

        {player.summary.withdrawals.map(withdrawalSection)}

        {stocks.map((stock, index) => {
          const money = moneyIn(stock.currency);
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
                description={`${stock.name}. ${headline}.${spreadSentence(stock, money)}`}
                registerDraw={registerDraw}
              />
            </section>
          );
        })}
      </div>
    </>
  );
}
