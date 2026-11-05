import { useRef, type ChangeEvent } from 'react';
import { useTranslations } from '../i18n';

// Long enough for the browser to have started the download.
const KEEP_DOWNLOAD_URL_MS = 1000;

interface Props {
  fileName: () => string;
  contents: () => string;
  onLoad: (text: string) => void;
  onReset: () => void;
}

// Saves to and reads from a file on the user's own machine, or starts over. Nothing leaves the browser.
export default function FileButtons({ fileName, contents, onLoad, onReset }: Props) {
  const t = useTranslations();
  const picker = useRef<HTMLInputElement>(null);

  function save() {
    const url = URL.createObjectURL(new Blob([contents()], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName();
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), KEEP_DOWNLOAD_URL_MS);
  }

  async function load({ target }: ChangeEvent<HTMLInputElement>) {
    const file = target.files?.[0];
    if (!file) return;
    const text = await file.text();
    // So that the same file can be chosen again.
    target.value = '';
    onLoad(text);
  }

  return (
    <div className="file-buttons">
      <button type="button" className="button" aria-label={t.saveFileHint} title={t.saveFileHint} onClick={save}>
        {t.saveFile}
      </button>
      <button
        type="button"
        className="button"
        aria-label={t.loadFileHint}
        title={t.loadFileHint}
        onClick={() => picker.current!.click()}
      >
        {t.loadFile}
      </button>
      <button type="button" className="button" aria-label={t.resetHint} title={t.resetHint} onClick={onReset}>
        {t.reset}
      </button>
      <input ref={picker} type="file" accept=".json,application/json" hidden onChange={load} />
    </div>
  );
}
