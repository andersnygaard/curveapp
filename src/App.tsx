import { useState, type KeyboardEvent } from 'react';
import { BritishFlag, NorwegianFlag } from './flags';
import { LanguageContext, translations, useLanguage } from './i18n';
import InputTab from './input/InputTab';
import { useGraph, useSimulationInput } from './input/useGraph';
import SimulationTab from './simulation/SimulationTab';

const tabs = ['simulation', 'input'] as const;
type Tab = (typeof tabs)[number];

export default function App() {
  const [language, setLanguage] = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('simulation');
  const t = translations[language];
  const { graph, setGraph, recovered } = useGraph(t.defaultNames);
  const input = useSimulationInput(graph);

  function moveBetweenTabs(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(tabs.indexOf(activeTab) + step + tabs.length) % tabs.length];
    setActiveTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <LanguageContext.Provider value={language}>
      <header className="header">
        <h1 className="wordmark">Curve</h1>
        <div className="flags" role="group" aria-label={t.language}>
          <button
            type="button"
            className="flag"
            aria-label="Norsk"
            aria-pressed={language === 'no'}
            title="Norsk"
            onClick={() => setLanguage('no')}
          >
            <NorwegianFlag />
          </button>
          <button
            type="button"
            className="flag"
            aria-label="English"
            aria-pressed={language === 'en'}
            title="English"
            onClick={() => setLanguage('en')}
          >
            <BritishFlag />
          </button>
        </div>
      </header>

      <div className="tablist" role="tablist" aria-label={t.sections} onKeyDown={moveBetweenTabs}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            id={`tab-${tab}`}
            className="tab"
            role="tab"
            aria-selected={tab === activeTab}
            aria-controls={`panel-${tab}`}
            tabIndex={tab === activeTab ? 0 : -1}
            onClick={() => setActiveTab(tab)}
          >
            {t[tab]}
            {tab === activeTab && (
              <svg className="tab-curve" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
                <path d="M0 12C28 12 32 1.5 50 1.5S72 12 100 12" />
              </svg>
            )}
          </button>
        ))}
      </div>

      <main className="main">
        <section
          id="panel-simulation"
          className="panel"
          role="tabpanel"
          aria-labelledby="tab-simulation"
          hidden={activeTab !== 'simulation'}
        >
          <SimulationTab active={activeTab === 'simulation'} input={input} />
        </section>
        <section
          id="panel-input"
          className="panel"
          role="tabpanel"
          aria-labelledby="tab-input"
          hidden={activeTab !== 'input'}
        >
          {activeTab === 'input' && <InputTab graph={graph} setGraph={setGraph} input={input} recovered={recovered} />}
        </section>
      </main>

      <footer className="footer">
        <span>Curve</span>
        <span>{t.privacyStatement}</span>
      </footer>
    </LanguageContext.Provider>
  );
}
