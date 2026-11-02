import type { KeyboardEvent } from 'react';

interface Props<Id extends string> {
  label: string;
  tabs: { id: Id; label: string }[];
  active: Id;
  onChange: (id: Id) => void;
}

// The panels are the caller's. Each tab points at panel-<id>.
export default function Tabs<Id extends string>({ label, tabs, active, onChange }: Props<Id>) {
  function moveBetweenTabs(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const current = tabs.findIndex((tab) => tab.id === active);
    const next = tabs[(current + step + tabs.length) % tabs.length].id;
    onChange(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div className="tablist" role="tablist" aria-label={label} onKeyDown={moveBetweenTabs}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          id={`tab-${tab.id}`}
          className="tab"
          role="tab"
          aria-selected={tab.id === active}
          aria-controls={`panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.id === active && (
            <svg className="tab-curve" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
              <path d="M0 12C28 12 32 1.5 50 1.5S72 12 100 12" />
            </svg>
          )}
        </button>
      ))}
    </div>
  );
}
