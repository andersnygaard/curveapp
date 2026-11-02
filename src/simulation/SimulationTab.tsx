import { useCallback, useEffect, useRef, useState } from 'react';
import type { StockSummary } from '../engine/statistics';
import { DAY_MS } from '../engine/timeline';
import { useTranslations } from '../i18n';
import { hasStocks, yearsToAge } from '../model/compile';
import { assumptionsOf } from '../model/query';
import type { SimulationInput } from '../model/types';
import AccountChart from './AccountChart';
import { useSimulation } from './useSimulation';

const HORIZONS = [5, 10, 20, 30];
const DEFAULT_YEARS = 30;
const LAST_AGE = 95;
const MAX_FRAME_MS = 100;

interface Props {
  active: boolean;
  input: SimulationInput;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function SimulationTab({ active, input }: Props) {
  const t = useTranslations();
  const [horizon, setHorizon] = useState<number | 'lastAge'>(DEFAULT_YEARS);
  const [paused, setPaused] = useState(false);
  const [, setPassesPlayed] = useState(0);

  // Edits in the Input tab take effect on the way back here, so typing never starts a new simulation.
  const [applied, setApplied] = useState(input);
  if (active && applied !== input) setApplied(input);

  const { birthYear } = assumptionsOf(applied.boxes);
  const yearsToLastAge = yearsToAge(applied, LAST_AGE);
  const canReachLastAge = yearsToLastAge > 0;
  const showingLastAge = horizon === 'lastAge' && canReachLastAge;
  const years = showingLastAge ? yearsToLastAge : horizon === 'lastAge' ? DEFAULT_YEARS : horizon;

  const { player, revision, failed } = useSimulation(applied, years);

  const drawers = useRef(new Set<() => void>());
  const registerDraw = useCallback((draw: () => void) => {
    drawers.current.add(draw);
    return () => {
      drawers.current.delete(draw);
    };
  }, []);

  useEffect(() => {
    if (!active || paused || !player) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = Math.max(0, Math.min(now - last, MAX_FRAME_MS));
      last = now;
      if (player.advance(elapsed, reducedMotion())) setPassesPlayed(player.completed);
      drawers.current.forEach((draw) => draw());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, paused, player]);

  // The median gets sharper in the background, also while paused.
  useEffect(() => drawers.current.forEach((draw) => draw()), [revision]);

  if (!hasStocks(applied)) return <p className="sim-empty">{t.noAccounts}</p>;
  if (failed) return <p className="sim-empty">{t.simulationFailed}</p>;
  if (!player) return <p className="sim-empty">{t.calculating}</p>;

  // The text follows the passes on screen, also in the moment before a new run has its first picture.
  const toLastAge = player.years === yearsToLastAge && horizon === 'lastAge';
  const percent = new Intl.NumberFormat(t.locale, { style: 'percent', maximumFractionDigits: 0 });
  const ageAt = (day: number) =>
    new Date(player.layout.startMs + day * DAY_MS).getUTCFullYear() - (birthYear ?? 0);

  function headlineOf(stock: StockSummary, money: Intl.NumberFormat): string {
    const amount = money.format(stock.lastValue);
    if (stock.closeDay !== null && stock.closeDay < player!.layout.totalDays) {
      return t.balanceAtAge(ageAt(stock.closeDay), amount);
    }
    return toLastAge ? t.medianAtAge(LAST_AGE, amount) : t.medianAfter(player!.years, amount);
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
              onClick={() => setHorizon(option)}
            >
              {t.yearsOption(option)}
            </button>
          ))}
          {canReachLastAge && (
            <button
              type="button"
              className="horizon"
              aria-pressed={showingLastAge}
              onClick={() => setHorizon('lastAge')}
            >
              {t.toAge95}
            </button>
          )}
        </div>
        <div className="sim-status">
          <span>{t.passNumber(player.completed + 1)}</span>
          <button type="button" className="sim-pause" onClick={() => setPaused(!paused)}>
            {paused ? t.resume : t.pause}
          </button>
        </div>
      </div>
      <p className="sim-legend">{t.simulationLegend}</p>

      {player.summary.gates.map((gate) => (
        <p key={gate.id} className="sim-gate">
          {toLastAge
            ? t.gateHeldToAge(gate.name, percent.format(gate.heldShare), LAST_AGE)
            : t.gateHeldWholePeriod(gate.name, percent.format(gate.heldShare))}
        </p>
      ))}

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
                  ? t.heldToAge(percent.format(stock.heldShare), LAST_AGE)
                  : t.heldWholePeriod(percent.format(stock.heldShare))}
              </p>
            )}
            {stock.afterTax !== null && <p className="chart-note">{t.afterTaxIfWithdrawn(money.format(stock.afterTax))}</p>}
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
