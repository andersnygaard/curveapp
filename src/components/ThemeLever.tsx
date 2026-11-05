import { useTranslations } from '../i18n';
import type { Theme } from '../theme';

interface Props {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

export default function ThemeLever({ theme, onChange }: Props) {
  const t = useTranslations();
  const light = theme === 'light';
  return (
    <button
      type="button"
      role="switch"
      className="lever"
      aria-label={t.lightColours}
      aria-checked={light}
      onClick={() => onChange(light ? 'dark' : 'light')}
    >
      <span className={light ? 'lever-word' : 'lever-word lever-word-on'}>{t.dark}</span>
      <span className="lever-track">
        <span className="lever-knob" />
      </span>
      <span className={light ? 'lever-word lever-word-on' : 'lever-word'}>{t.light}</span>
    </button>
  );
}
