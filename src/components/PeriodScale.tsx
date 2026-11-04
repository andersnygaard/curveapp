import type { CSSProperties } from 'react';

export interface PeriodOption {
  id: string;
  label: string;
  years: number;
  chosen: boolean;
  onChoose: () => void;
}

interface Props {
  label: string;
  options: PeriodOption[];
}

// Like the scale on a map: each part is as long as the years it covers, so the choice also shows how far it reaches.
export default function PeriodScale({ label, options }: Props) {
  return (
    <div className="horizons" role="group" aria-label={label}>
      {options.map(({ id, label: text, years, chosen, onChoose }) => (
        <button
          key={id}
          type="button"
          className="horizon"
          style={{ '--years': years } as CSSProperties}
          aria-pressed={chosen}
          onClick={onChoose}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
