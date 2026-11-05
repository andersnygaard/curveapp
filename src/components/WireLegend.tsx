import { useTranslations } from '../i18n';
import { WIRE_KINDS } from '../model/types';

export default function WireLegend() {
  const t = useTranslations();
  return (
    <ul className="wire-legend">
      {WIRE_KINDS.map((kind) => (
        <li key={kind}>
          <span className={`port-sample port-${kind}`} aria-hidden="true" />
          <svg viewBox="0 0 32 8" aria-hidden="true">
            <line className={`wire-sample wire-sample-${kind}`} x1="0" x2="32" y1="4" y2="4" />
          </svg>
          {t.wireKinds[kind]}
        </li>
      ))}
    </ul>
  );
}
