import { useTranslations } from '../i18n';
import type { WireKind } from '../model/types';

export default function WireLegend() {
  const t = useTranslations();
  const kinds: [WireKind, string][] = [
    ['money', t.wireMoney],
    ['influence', t.wireInfluence],
    ['basis', t.wireBasis],
  ];
  return (
    <ul className="wire-legend">
      {kinds.map(([kind, label]) => (
        <li key={kind}>
          <span className={`port-sample port-${kind}`} aria-hidden="true" />
          <svg viewBox="0 0 32 8" aria-hidden="true">
            <line className={`wire-sample wire-sample-${kind}`} x1="0" x2="32" y1="4" y2="4" />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}
