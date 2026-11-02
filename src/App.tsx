import { useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import FileButtons from './components/FileButtons';
import Footer from './components/Footer';
import Header from './components/Header';
import LanguagePicker from './components/LanguagePicker';
import Tabs from './components/Tabs';
import { LanguageContext, translations, useLanguage } from './i18n';
import InputTab from './input/InputTab';
import { useGraph, useSimulationInput } from './input/useGraph';
import { today } from './model/dates';
import { parseGraph, serializeGraph } from './model/storage';
import SimulationTab from './simulation/SimulationTab';

const tabs = ['simulation', 'input'] as const;
type Tab = (typeof tabs)[number];

export default function App() {
  const [language, setLanguage] = useLanguage();
  const [activeTab, setActiveTab] = useState<Tab>('simulation');
  const t = translations[language];
  const { graph, setGraph, recovered } = useGraph(t.defaultNames);
  const input = useSimulationInput(graph);
  const [filesLoaded, setFilesLoaded] = useState(0);
  const [unreadableFile, setUnreadableFile] = useState(false);

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
        <LanguagePicker language={language} onChange={setLanguage} />
      </Header>

      <Tabs
        label={t.sections}
        tabs={tabs.map((id) => ({ id, label: t[id] }))}
        active={activeTab}
        onChange={setActiveTab}
      />

      {unreadableFile && (
        <p className="file-error" role="alert">
          {t.fileUnreadable}
          <button type="button" aria-label={t.close} onClick={() => setUnreadableFile(false)}>
            ×
          </button>
        </p>
      )}

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
              <InputTab key={filesLoaded} graph={graph} setGraph={setGraph} input={input} recovered={recovered && filesLoaded === 0} />
            </ErrorBoundary>
          )}
        </section>
      </main>

      <Footer />
    </LanguageContext.Provider>
  );
}
