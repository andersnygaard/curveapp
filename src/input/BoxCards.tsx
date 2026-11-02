import { useContext, useState, type ReactNode } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Position,
  useReactFlow,
  type EdgeProps,
  type NodeProps,
} from '@xyflow/react';
import { LanguageContext, translations } from '../i18n';
import type { IncomeInterval, ReturnInterval } from '../simulation/scenario';
import type { AccountBox, Box, BoxType, GBox, IncomeBox, MeBox, OtpBox, PensionBox, TransferBox } from './boxes';

const INCOME_INTERVALS: IncomeInterval[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const RETURN_INTERVALS: ReturnInterval[] = ['daily', 'tradingDays', 'monthly', 'yearly'];

function useTranslations() {
  return translations[useContext(LanguageContext)];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="box-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input className="nodrag" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

// Keeps what is typed, so a field can be empty on the way to a new number.
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
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

function IntervalField<T extends IncomeInterval | ReturnInterval>(props: {
  label: string;
  value: T;
  options: T[];
  onChange: (value: T) => void;
}) {
  const t = useTranslations();
  return (
    <Field label={props.label}>
      <select className="nodrag" value={props.value} onChange={(event) => props.onChange(event.target.value as T)}>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {t[option]}
          </option>
        ))}
      </select>
    </Field>
  );
}

function BoxCard({ id, type, name, children }: { id: string; type: BoxType; name?: string; children: ReactNode }) {
  const t = useTranslations();
  const { deleteElements } = useReactFlow();
  return (
    <div className={`box box-${type}`}>
      {(type === 'transfer' || type === 'account' || type === 'otp' || type === 'pension') && (
        <Handle type="target" position={Position.Left} />
      )}
      <div className="box-header">
        <span>{t[type]}</span>
        {name !== undefined && (
          <button
            type="button"
            className="box-delete nodrag"
            aria-label={t.deleteBox(name)}
            onClick={() => deleteElements({ nodes: [{ id }] })}
          >
            ×
          </button>
        )}
      </div>
      {children}
      {(type === 'income' || type === 'transfer') && <Handle type="source" position={Position.Right} />}
    </div>
  );
}

function useUpdate<B extends Box>(id: string) {
  const { updateNodeData } = useReactFlow();
  return (patch: Partial<B['data']>) => updateNodeData(id, patch);
}

function IncomeCard({ id, data }: NodeProps<IncomeBox>) {
  const t = useTranslations();
  const update = useUpdate<IncomeBox>(id);
  return (
    <BoxCard id={id} type="income" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.amount} value={data.amount} onChange={(amount) => update({ amount })} />
      <IntervalField
        label={t.interval}
        value={data.interval}
        options={INCOME_INTERVALS}
        onChange={(interval) => update({ interval })}
      />
    </BoxCard>
  );
}

function TransferCard({ id, data }: NodeProps<TransferBox>) {
  const t = useTranslations();
  const update = useUpdate<TransferBox>(id);
  return (
    <BoxCard id={id} type="transfer" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.amount} value={data.amount} onChange={(amount) => update({ amount })} />
    </BoxCard>
  );
}

function AccountCard({ id, data }: NodeProps<AccountBox>) {
  const t = useTranslations();
  const update = useUpdate<AccountBox>(id);
  return (
    <BoxCard id={id} type="account" name={data.name}>
      <Field label={t.accountType}>
        <select
          className="nodrag"
          value={data.accountType}
          onChange={(event) => update({ accountType: event.target.value as AccountBox['data']['accountType'] })}
        >
          <option value="regular">{t.regularAccount}</option>
          <option value="ask">{t.askAccount}</option>
        </select>
      </Field>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.startAmount} value={data.startAmount} onChange={(startAmount) => update({ startAmount })} />
      <Field label={t.startDate}>
        <input
          className="nodrag"
          type="date"
          value={data.startDate}
          onChange={(event) => update({ startDate: event.target.value })}
        />
      </Field>
      <Field label={t.currency}>
        <span className="box-value">{data.currency}</span>
      </Field>
      <NumberField
        label={t.annualReturn}
        value={data.annualReturn}
        onChange={(annualReturn) => update({ annualReturn })}
      />
      <IntervalField
        label={t.returnInterval}
        value={data.returnInterval}
        options={RETURN_INTERVALS}
        onChange={(returnInterval) => update({ returnInterval })}
      />
      <NumberField
        label={t.standardDeviation}
        value={data.standardDeviation}
        onChange={(standardDeviation) => update({ standardDeviation })}
      />
      {data.accountType === 'ask' && (
        <>
          <NumberField label={t.taxRate} value={data.taxRate} onChange={(taxRate) => update({ taxRate })} />
          <NumberField label={t.inflation} value={data.inflation} onChange={(inflation) => update({ inflation })} />
        </>
      )}
    </BoxCard>
  );
}

function OtpCard({ id, data }: NodeProps<OtpBox>) {
  const t = useTranslations();
  const update = useUpdate<OtpBox>(id);
  return (
    <BoxCard id={id} type="otp" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.startAmount} value={data.startAmount} onChange={(startAmount) => update({ startAmount })} />
      <Field label={t.startDate}>
        <input
          className="nodrag"
          type="date"
          value={data.startDate}
          onChange={(event) => update({ startDate: event.target.value })}
        />
      </Field>
      <NumberField
        label={t.annualReturn}
        value={data.annualReturn}
        onChange={(annualReturn) => update({ annualReturn })}
      />
      <IntervalField
        label={t.returnInterval}
        value={data.returnInterval}
        options={RETURN_INTERVALS}
        onChange={(returnInterval) => update({ returnInterval })}
      />
      <NumberField
        label={t.standardDeviation}
        value={data.standardDeviation}
        onChange={(standardDeviation) => update({ standardDeviation })}
      />
      <NumberField label={t.lowRate} value={data.lowRate} onChange={(lowRate) => update({ lowRate })} />
      <NumberField label={t.highRate} value={data.highRate} onChange={(highRate) => update({ highRate })} />
    </BoxCard>
  );
}

function PensionCard({ id, data }: NodeProps<PensionBox>) {
  const t = useTranslations();
  const update = useUpdate<PensionBox>(id);
  return (
    <BoxCard id={id} type="pension" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.balance} value={data.startAmount} onChange={(startAmount) => update({ startAmount })} />
      <Field label={t.date}>
        <input
          className="nodrag"
          type="date"
          value={data.startDate}
          onChange={(event) => update({ startDate: event.target.value })}
        />
      </Field>
    </BoxCard>
  );
}

function GCard({ id, data }: NodeProps<GBox>) {
  const t = useTranslations();
  const update = useUpdate<GBox>(id);
  return (
    <BoxCard id={id} type="g">
      <NumberField label={t.gValue} value={data.g} onChange={(g) => update({ g })} />
      <NumberField label={t.gGrowth} value={data.gGrowth} onChange={(gGrowth) => update({ gGrowth })} />
      <NumberField
        label={t.standardDeviation}
        value={data.standardDeviation}
        onChange={(standardDeviation) => update({ standardDeviation })}
      />
      <p className="box-note">{t.gNote}</p>
    </BoxCard>
  );
}

function MeCard({ id, data }: NodeProps<MeBox>) {
  const t = useTranslations();
  const update = useUpdate<MeBox>(id);
  return (
    <BoxCard id={id} type="me">
      <Field label={t.birthYear}>
        <input
          className="nodrag"
          type="number"
          value={data.birthYear || ''}
          onChange={(event) => update({ birthYear: Number(event.target.value) || 0 })}
        />
      </Field>
      <p className="box-note">{t.meNote}</p>
    </BoxCard>
  );
}

export const nodeTypes = {
  income: IncomeCard,
  transfer: TransferCard,
  account: AccountCard,
  otp: OtpCard,
  pension: PensionCard,
  g: GCard,
  me: MeCard,
};

function BoxEdge({ id, selected, markerEnd, ...geometry }: EdgeProps) {
  const t = useTranslations();
  const { deleteElements } = useReactFlow();
  const [path, labelX, labelY] = getBezierPath(geometry);
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="edge-delete nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            aria-label={t.deleteConnector}
            onClick={() => deleteElements({ edges: [{ id }] })}
          >
            ×
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { box: BoxEdge };
