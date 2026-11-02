import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { translations, type Language } from '../i18n';
import AccountChart from './AccountChart';
import { createSimulation } from './engine';
import { Player } from './player';
import type { Scenario } from './scenario';

const HORIZONS = [5, 10, 20, 30];
const DEFAULT_YEARS = 30;
const LAST_AGE = 95;
const MAX_FRAME_MS = 100;

interface Props {
  language: Language;
  active: boolean;
  scenario: Scenario;
}

export default function SimulationTab({ language, active, scenario }: Props) {
  const t = translations[language];
  const [horizon, setHorizon] = useState<number | 'lastAge'>(DEFAULT_YEARS);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(0);

  // Edits in the Input tab take effect on the way back here, so typing never waits for a new simulation.
  const [applied, setApplied] = useState(scenario);
  if (active && applied !== scenario) setApplied(scenario);

  const { birthYear } = applied;
  const startYear = Math.min(...[...applied.accounts, ...applied.pensions].map((entry) => Date.parse(entry.startDate)));
  const yearsToLastAge = birthYear === null ? 0 : LAST_AGE - (new Date(startYear).getUTCFullYear() - birthYear);
  const canReachLastAge = yearsToLastAge > 0;
  const showingLastAge = horizon === 'lastAge' && canReachLastAge;
  const years = showingLastAge ? yearsToLastAge : horizon === 'lastAge' ? DEFAULT_YEARS : horizon;

  const player = useMemo(
    () =>
      applied.accounts.length + applied.pensions.length > 0 ? new Player(createSimulation(applied, years)) : null,
    [applied, years],
  );
  useEffect(() => setCompleted(0), [player]);

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
      if (player.advance(elapsed)) setCompleted(player.completed);
      drawers.current.forEach((draw) => draw());
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, paused, player]);

  if (!player) return <p className="sim-empty">{t.noAccounts}</p>;

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
          <span>{t.passNumber(completed + 1)}</span>
          <button type="button" className="sim-pause" onClick={() => setPaused(!paused)}>
            {paused ? t.resume : t.pause}
          </button>
        </div>
      </div>
      <p className="sim-legend">{t.simulationLegend}</p>

      {player.simulation.accounts.map((account, index) => {
        const money = new Intl.NumberFormat(t.locale, {
          style: 'currency',
          currency: account.currency,
          maximumFractionDigits: 0,
        });
        const endValue = money.format(account.expected[account.expected.length - 1]);
        const expected = showingLastAge ? t.expectedAtAge(LAST_AGE, endValue) : t.expectedAfter(years, endValue);
        return (
          <section key={account.id} className="chart">
            <div className="chart-heading">
              <h2 className="chart-name">{account.name}</h2>
              <span className="chart-expected">{expected}</span>
            </div>
            {account.calculated && <p className="chart-note">{t.calculatedBalance}</p>}
            {account.afterTax !== undefined && (
              <p className="chart-note">{t.afterTaxIfWithdrawn(money.format(account.afterTax))}</p>
            )}
            <AccountChart
              player={player}
              index={index}
              locale={t.locale}
              birthYear={birthYear}
              ageLabel={t.ageTick}
              description={`${account.name}. ${expected}`}
              registerDraw={registerDraw}
            />
          </section>
        );
      })}
    </div>
  );
}
