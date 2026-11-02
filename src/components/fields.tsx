// The fields a box card is made of. They know nothing about boxes, so they can be used and tested on their own.
import { useState, type ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="box-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

interface ValueProps<T> {
  label: string;
  value: T;
  onChange: (value: T) => void;
}

export function TextField({ label, value, onChange }: ValueProps<string>) {
  return (
    <Field label={label}>
      <input className="nodrag" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

// Keeps what is typed, so a field can be empty on the way to a new number.
export function NumberField({ label, value, onChange }: ValueProps<number>) {
  const [text, setText] = useState(String(value));
  return (
    <Field label={label}>
      <input
        className="nodrag"
        type="number"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          onChange(Number(event.target.value) || 0);
        }}
        onBlur={() => setText(String(value))}
      />
    </Field>
  );
}

// Empty means something of its own, such as no payout, so it is kept apart from 0.
export function OptionalNumberField({ label, value, onChange, placeholder }: ValueProps<number | null> & { placeholder?: string }) {
  return (
    <Field label={label}>
      <input
        className="nodrag"
        type="number"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
      />
    </Field>
  );
}

export function DateField({ label, value, onChange }: ValueProps<string>) {
  return (
    <Field label={label}>
      <input className="nodrag" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options }: ValueProps<T> & { options: { value: T; label: string }[] }) {
  return (
    <Field label={label}>
      <select className="nodrag" value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckField({ label, value, onChange }: ValueProps<boolean>) {
  return (
    <label className="box-check">
      <input className="nodrag" type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
