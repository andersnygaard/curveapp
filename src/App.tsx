import { useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import FileButtons from './components/FileButtons';
import Footer from './components/Footer';
import Header from './components/Header';
import LanguagePicker from './components/LanguagePicker';
import Tabs, { TabPanel } from './components/Tabs';
import ThemeLever from './components/ThemeLever';
import Tour from './components/Tour';
import { LanguageContext, translations, useLanguage, wordsBetween, type Language } from './i18n';
import InputTab from './input/InputTab';
import { useSetup } from './input/useSetup';
import { today } from './model/dates';
import { serializeGraph } from './model/storage';
import type { SimulationInput } from './model/types';
import PlanPanel from './simulation/PlanPanel';
import SimulationTab from './simulation/SimulationTab';
import { usePlanOpen } from './simulation/usePlanOpen';
import { useTheme } from './theme';
import { useWelcomeTour, welcomeSteps } from './welcomeTour';

const tabs = ['simulation', 'input'] as const;
type Tab = (typeof tabs)[number];

// Beside the page on a wide screen. On a narrow one it lies over the page, and a tap beside it closes it.
function PlanDrawer({ input, onClose }: { input: SimulationInput; onClose: () => void }) {
  return (
    <>
      <button type="button" className="plan-backdrop" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <div className="plan-drawer">
        <PlanPanel input={input} onClose={onClose} />
      </div>
    </>
  );
}

export default function App() {
  const [language, setLanguage] = useLanguage();
  const [theme, chooseTheme] = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('simulation');
  const t = translations[language];
  // Before the setup, which saves the boxes, so the tour can tell who is new.
  const tour = useWelcomeTour();
  const setup = useSetup(t);
  const [planOpen, choosePlanOpen] = usePlanOpen();
  // The tour shows the plan when it gets there, and that is not the user's choice, so it is not remembered.
  const planShown = tour.touring ? tour.planShown : planOpen;

  function changeLanguage(next: Language) {
    setLanguage(next);
    setup.rename(wordsBetween(language, next));
  }

  return (
    <LanguageContext.Provider value={language}>
      <Header>
        <FileButtons
          fileName={() => `curve-${today()}.json`}
          contents={() => serializeGraph(setup.graph)}
          onLoad={setup.load}
          onReset={setup.reset}
        />
        <LanguagePicker language={language} onChange={changeLanguage} />
        <ThemeLever theme={theme} onChange={chooseTheme} />
        <button type="button" className="tour-open" aria-label={t.tourOpen} title={t.tourOpen} onClick={tour.start}>
          ?
        </button>
      </Header>

      <div className="tab-row">
        <Tabs
          label={t.sections}
          tabs={tabs.map((id) => ({ id, label: t.tabs[id] }))}
          active={activeTab}
          onChange={setActiveTab}
        />
        <button type="button" className="input-add" aria-pressed={planShown} onClick={() => choosePlanOpen(!planShown)}>
          {t.plan}
        </button>
      </div>

      {setup.unreadableFile && (
        <p className="file-error" role="alert">
          {t.fileUnreadable}
          <button type="button" aria-label={t.close} onClick={setup.dismissUnreadable}>
            ×
          </button>
        </p>
      )}

      <div className={planShown ? 'workspace workspace-with-plan' : 'workspace'}>
        <main className="main">
          <TabPanel id="simulation" active={activeTab === 'simulation'}>
            <ErrorBoundary message={t.somethingWentWrong}>
              <SimulationTab active={activeTab === 'simulation'} input={setup.input} />
            </ErrorBoundary>
          </TabPanel>
          <TabPanel id="input" active={activeTab === 'input'}>
            {activeTab === 'input' && (
              <ErrorBoundary message={t.somethingWentWrong}>
                <InputTab
                  key={setup.generation}
                  graph={setup.graph}
                  setGraph={setup.setGraph}
                  input={setup.input}
                  recovered={setup.recovered}
                  planShown={planShown}
                />
              </ErrorBoundary>
            )}
          </TabPanel>
        </main>
        {planShown && <PlanDrawer input={setup.input} onClose={() => choosePlanOpen(false)} />}
      </div>

      <Footer />

      {tour.touring && <Tour steps={welcomeSteps(t, setActiveTab, tour.showPlan)} onClose={tour.close} />}
    </LanguageContext.Provider>
  );
}
