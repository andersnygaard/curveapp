import { useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import FileButtons from './components/FileButtons';
import Footer from './components/Footer';
import Header from './components/Header';
import LanguagePicker from './components/LanguagePicker';
import Tabs from './components/Tabs';
import Tour from './components/Tour';
import { LanguageContext, translations, useLanguage, wordsBetween, type Language } from './i18n';
import InputTab from './input/InputTab';
import { useGraph, useSimulationInput } from './input/useGraph';
import { today } from './model/dates';
import { renameBoxes } from './model/names';
import { parseGraph, serializeGraph } from './model/storage';
import PlanPanel from './simulation/PlanPanel';
import SimulationTab from './simulation/SimulationTab';
import { usePlanOpen } from './simulation/usePlanOpen';
import { isNewHere, markTourSeen, welcomeSteps } from './welcomeTour';

const tabs = ['simulation', 'input'] as const;
type Tab = (typeof tabs)[number];

export default function App() {
  const [language, setLanguage] = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('simulation');
  const t = translations[language];
  // Asked before the first save below, which would make everyone look like they have been here before.
  const [touring, setTouring] = useState(isNewHere);
  const { graph, setGraph, recovered } = useGraph(t.defaultNames);
  const input = useSimulationInput(graph);
  const [filesLoaded, setFilesLoaded] = useState(0);
  const [unreadableFile, setUnreadableFile] = useState(false);
  const [planOpen, choosePlanOpen] = usePlanOpen();
  // The tour shows the plan when it gets there, and that is not the user's choice, so it is not remembered.
  const [planInTour, setPlanInTour] = useState(false);
  const planShown = touring ? planInTour : planOpen;

  useEffect(() => {
    if (touring) markTourSeen();
  }, [touring]);

  function changeLanguage(next: Language) {
    setLanguage(next);
    setGraph((current) => renameBoxes(current, wordsBetween(language, next)));
  }

  // It only asks once it knows that the file can be read, and nothing changes until the answer is yes.
  function loadFile(text: string) {
    try {
      const loaded = parseGraph(text, t.defaultNames);
      setUnreadableFile(false);
      if (!window.confirm(t.confirmLoad)) return;
      setGraph(loaded);
      setFilesLoaded(filesLoaded + 1);
    } catch {
      setUnreadableFile(true);
    }
  }

  return (
    <LanguageContext.Provider value={language}>
      <Header>
        <FileButtons
          fileName={() => `curve-${today()}.json`}
          contents={() => serializeGraph(graph)}
          onLoad={loadFile}
        />
        <LanguagePicker language={language} onChange={changeLanguage} />
        <button type="button" className="tour-open" aria-label={t.tourOpen} title={t.tourOpen} onClick={() => setTouring(true)}>
          ?
        </button>
      </Header>

      <div className="tab-row">
        <Tabs
          label={t.sections}
          tabs={tabs.map((id) => ({ id, label: t[id] }))}
          active={activeTab}
          onChange={setActiveTab}
        />
        <button type="button" className="input-add" aria-pressed={planShown} onClick={() => choosePlanOpen(!planShown)}>
          {t.plan}
        </button>
      </div>

      {unreadableFile && (
        <p className="file-error" role="alert">
          {t.fileUnreadable}
          <button type="button" aria-label={t.close} onClick={() => setUnreadableFile(false)}>
            ×
          </button>
        </p>
      )}

      <div className={planShown ? 'workspace workspace-with-plan' : 'workspace'}>
        <main className="main">
          <section
            id="panel-simulation"
            className="panel"
            role="tabpanel"
            aria-labelledby="tab-simulation"
            hidden={activeTab !== 'simulation'}
          >
            <ErrorBoundary message={t.somethingWentWrong}>
              <SimulationTab active={activeTab === 'simulation'} input={input} />
            </ErrorBoundary>
          </section>
          <section
            id="panel-input"
            className="panel"
            role="tabpanel"
            aria-labelledby="tab-input"
            hidden={activeTab !== 'input'}
          >
            {activeTab === 'input' && (
              <ErrorBoundary message={t.somethingWentWrong}>
                <InputTab key={filesLoaded} graph={graph} setGraph={setGraph} input={input} recovered={recovered && filesLoaded === 0} planOpen={planShown} />
              </ErrorBoundary>
            )}
          </section>
        </main>
        {planShown && (
          <>
            <button type="button" className="plan-backdrop" aria-hidden="true" tabIndex={-1} onClick={() => choosePlanOpen(false)} />
            <div className="plan-drawer">
              <PlanPanel input={input} onClose={() => choosePlanOpen(false)} />
            </div>
          </>
        )}
      </div>

      <Footer />

      {touring && <Tour steps={welcomeSteps(t, setActiveTab, setPlanInTour)} onClose={() => setTouring(false)} />}
    </LanguageContext.Provider>
  );
}
