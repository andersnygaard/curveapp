import { useTranslations, type Language } from '../i18n';
import { BritishFlag, NorwegianFlag } from './flags';

interface Props {
  language: Language;
  onChange: (language: Language) => void;
}

export default function LanguagePicker({ language, onChange }: Props) {
  const t = useTranslations();
  return (
    <div className="flags" role="group" aria-label={t.language}>
      <button
        type="button"
        className="flag"
        aria-label="Norsk"
        aria-pressed={language === 'no'}
        title="Norsk"
        onClick={() => onChange('no')}
      >
        <NorwegianFlag />
      </button>
      <button
        type="button"
        className="flag"
        aria-label="English"
        aria-pressed={language === 'en'}
        title="English"
        onClick={() => onChange('en')}
      >
        <BritishFlag />
      </button>
    </div>
  );
}
