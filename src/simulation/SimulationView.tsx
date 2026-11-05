import AccountChart, { LineSample } from '../components/AccountChart';
import Aurora from '../components/Aurora';
import PeriodScale, { type PeriodOption } from '../components/PeriodScale';
import WithdrawalsChart from '../components/WithdrawalsChart';
import type { RegisterDraw } from '../components/canvas';
import { moneyFormat } from '../components/formats';
import type { Layout } from '../engine/simulate';
import type { StockSummary, WithdrawalSummary } from '../engine/statistics';
import { useTranslations } from '../i18n';
import { LAST_AGE } from '../model/compile';
import { HORIZONS, yearsOf, type Horizon } from './horizon';
import type { Player } from './player';
import { sentencesFor, type Sentences } from './sentences';

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
  registerDraw: RegisterDraw;
}

interface WithdrawalSectionProps {
  withdrawal: WithdrawalSummary;
  layout: Layout;
  birthYear: number | null;
}

// Where the money for one withdrawal comes from, year by year.
function WithdrawalSection({ withdrawal, layout, birthYear }: WithdrawalSectionProps) {
  const t = useTranslations();
  const money = moneyFormat(t.locale, withdrawal.currency);
  return (
    <section className="withdrawal">
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
        startMs={layout.startMs}
        totalDays={layout.totalDays}
        birthYear={birthYear}
        locale={t.locale}
        currency={withdrawal.currency}
        ageLabel={t.ageTick}
      />
    </section>
  );
}

interface AccountSectionProps {
  stock: StockSummary;
  index: number;
  player: Player;
  birthYear: number | null;
  say: Sentences;
  registerDraw: RegisterDraw;
}

// One account or pension: where it ends up, the notes that belong to it, and its chart.
function AccountSection({ stock, index, player, birthYear, say, registerDraw }: AccountSectionProps) {
  const t = useTranslations();
  const money = moneyFormat(t.locale, stock.currency);
  const headline = say.headline(stock);
  const notes = [
    stock.calculated ? t.calculatedBalance : null,
    stock.payoutPerYear !== null ? t.payoutPerYear(money.format(stock.payoutPerYear)) : null,
    stock.heldShare !== null ? say.held(stock.heldShare) : null,
    stock.afterTax !== null ? t.afterTaxIfWithdrawn(money.format(stock.afterTax)) : null,
  ].filter((note) => note !== null);
  // The thin lines in the chart that need a word, each with a piece of the line itself.
  const legend = { deposits: t.depositsLegend, shield: t.shieldLegend };
  const lines = (['deposits', 'shield'] as const).filter((line) => stock[line]);
  return (
    <section className="chart">
      <div className="chart-heading">
        <h2 className="chart-name">{stock.name}</h2>
        <span className="chart-headline">{headline}</span>
      </div>
      {(notes.length > 0 || lines.length > 0) && (
        <div className="chart-notes">
          {notes.map((note) => (
            <p key={note} className="chart-note">
              {note}
            </p>
          ))}
          {lines.length > 0 && (
            <ul className="chart-legend">
              {lines.map((line) => (
                <li key={line}>
                  <LineSample line={line} />
                  {legend[line]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <AccountChart
        player={player}
        index={index}
        locale={t.locale}
        birthYear={birthYear}
        ageLabel={t.ageTick}
        description={`${stock.name}. ${headline}.${say.spread(stock)}`}
        registerDraw={registerDraw}
      />
    </section>
  );
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
  const say = sentencesFor(t, { years: player.years, layout: player.layout, birthYear, toLastAge });

  // The first account behind the headline, since a pension that is only calculated or paid out says less about the plan.
  const { stocks, gates } = player.summary;
  const heroIndex = Math.max(0, stocks.findIndex((stock) => !stock.calculated && stock.closeDay === null));
  const heroStock = stocks[heroIndex] as StockSummary | undefined;
  const heroMedian = heroStock && `${heroStock.name}. ${say.headline(heroStock)}.`;
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
      ? [
          {
            id: 'lastAge',
            label: t.toLastAgeOption(LAST_AGE),
            years: yearsToLastAge,
            chosen: showingLastAge,
            onChoose: () => onHorizon('lastAge'),
          },
        ]
      : []),
  ];

  return (
    <>
      <section className="sim-hero">
        {heroStock && <Aurora player={player} index={heroIndex} registerDraw={registerDraw} />}
        <div className="sim-hero-content">
          <h2 className="sim-headline">{firstGate ? say.gate(firstGate) : heroMedian}</h2>
          <div className="sim-toolbar">
            <PeriodScale label={t.simulationPeriod} options={periods} />
            <div className="sim-status">
              <span>{t.passNumber(player.completed + 1)}</span>
              <button type="button" className="button" onClick={onTogglePause}>
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
          <p key={gate.id} className="callout callout-note sim-gate">
            {say.gate(gate)}
          </p>
        ))}

        {player.summary.withdrawals.map((withdrawal) => (
          <WithdrawalSection key={withdrawal.id} withdrawal={withdrawal} layout={player.layout} birthYear={birthYear} />
        ))}

        {stocks.map((stock, index) => (
          <AccountSection
            key={stock.id}
            stock={stock}
            index={index}
            player={player}
            birthYear={birthYear}
            say={say}
            registerDraw={registerDraw}
          />
        ))}
      </div>
    </>
  );
}
