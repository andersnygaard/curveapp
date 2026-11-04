import { createContext, useContext, type ReactNode } from 'react';
import { Handle, Position, useReactFlow, type Node, type NodeProps } from '@xyflow/react';
import { DateField, Field, NumberField, OptionalNumberField, SelectField, TextField } from '../components/fields';
import { estimatedDivisor } from '../engine/norway';
import type { Interval } from '../engine/timeline';
import { useTranslations, type Translations } from '../i18n';
import { incomePerMonth, spendPerMonth, type BudgetLine } from '../model/boxes/budget';
import type { IncomeInterval } from '../model/boxes/pay';
import type { ReturnInterval } from '../model/boxes/returnBox';
import { drawsFromAccount } from '../model/boxes/transfer';
import { catalog } from '../model/catalog';
import type { Diagnostic, GraphQuery } from '../model/spec';
import type { Box, BoxOfType, BoxType, WireKind } from '../model/types';

const INCOME_INTERVALS: IncomeInterval[] = ['weekly', 'monthly', 'quarterly', 'yearly'];
const RETURN_INTERVALS: ReturnInterval[] = ['daily', 'tradingDays', 'monthly', 'yearly'];
const TRANSFER_INTERVALS: Interval[] = ['monthly', 'quarterly', 'yearly'];
const INTO_FROM: Record<WireKind, Position> = { money: Position.Left, influence: Position.Top, basis: Position.Left };
const OUT_TO: Record<WireKind, Position> = { money: Position.Right, influence: Position.Bottom, basis: Position.Bottom };

interface CardContextValue {
  query: GraphQuery;
  diagnostics: Diagnostic[];
  money: (amount: number) => string;
}

export const CardContext = createContext<CardContextValue | null>(null);

const useCardContext = () => useContext(CardContext)!;

type CardProps<Type extends BoxType> = NodeProps<Node<BoxOfType<Type>['data'] & Record<string, unknown>, Type>>;

function useUpdate<Type extends BoxType>(id: string) {
  const { updateNodeData } = useReactFlow();
  return (patch: Partial<BoxOfType<Type>['data']>) => updateNodeData(id, patch);
}

const intervalOptions = <T extends keyof Translations>(t: Translations, values: T[]) =>
  values.map((value) => ({ value, label: String(t[value]) }));

function Ports({ type }: { type: BoxType }) {
  const { takes, gives } = catalog[type];
  return (
    <>
      {(Object.keys(takes ?? {}) as WireKind[]).map((kind) => (
        <Handle key={`in-${kind}`} id={kind} type="target" position={INTO_FROM[kind]} className={`port port-${kind}`} />
      ))}
      {(Object.keys(gives ?? {}) as WireKind[]).map((kind) => (
        <Handle key={`out-${kind}`} id={kind} type="source" position={OUT_TO[kind]} className={`port port-${kind}`} />
      ))}
    </>
  );
}

function BoxCard({ id, type, name, children }: { id: string; type: BoxType; name?: string; children: ReactNode }) {
  const t = useTranslations();
  const { deleteElements } = useReactFlow();
  const { diagnostics } = useCardContext();
  return (
    <div className={`box box-${type}`}>
      <Ports type={type} />
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
      {diagnostics
        .filter((diagnostic) => diagnostic.boxId === id)
        .map(({ code }) => (
          <p key={code} className="box-warning">
            {t.diagnostics[code]}
          </p>
        ))}
    </div>
  );
}

function IncomeCard({ id, data }: CardProps<'income'>) {
  const t = useTranslations();
  const update = useUpdate<'income'>(id);
  return (
    <BoxCard id={id} type="income" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.netPay} value={data.amount} onChange={(amount) => update({ amount })} />
      <SelectField
        label={t.interval}
        value={data.interval}
        options={intervalOptions(t, INCOME_INTERVALS)}
        onChange={(interval) => update({ interval })}
      />
      <NumberField label={t.pensionBasis} value={data.pensionBasis} onChange={(pensionBasis) => update({ pensionBasis })} />
      <OptionalNumberField label={t.fromAge} value={data.fromAge} placeholder={t.fromTheStart} onChange={(fromAge) => update({ fromAge })} />
      <OptionalNumberField label={t.toAge} value={data.toAge} placeholder={t.toTheEnd} onChange={(toAge) => update({ toAge })} />
    </BoxCard>
  );
}

function TransferCard({ id, data, type }: CardProps<'transfer'>) {
  const t = useTranslations();
  const update = useUpdate<'transfer'>(id);
  const { query } = useCardContext();
  const source = query.into({ id, type, data } as Box, 'money')[0];
  return (
    <BoxCard id={id} type="transfer" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.amount} value={data.amount} onChange={(amount) => update({ amount })} />
      {drawsFromAccount(source) && (
        <SelectField
          label={t.interval}
          value={data.interval}
          options={intervalOptions(t, TRANSFER_INTERVALS)}
          onChange={(interval) => update({ interval })}
        />
      )}
    </BoxCard>
  );
}

function BudgetCard({ id, data, type }: CardProps<'budget'>) {
  const t = useTranslations();
  const update = useUpdate<'budget'>(id);
  const { query, money } = useCardContext();
  const box = { id, type, data } as BoxOfType<'budget'>;
  const spend = spendPerMonth(box);
  const income = incomePerMonth(box, query);

  function setLine(lineId: string, patch: Partial<BudgetLine>) {
    update({ lines: data.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)) });
  }
  function addLine() {
    const lineId = `line-${Date.now().toString(36)}`;
    update({ lines: [...data.lines, { id: lineId, name: t.newBudgetLine, amount: 0 }] });
  }

  return (
    <BoxCard id={id} type="budget" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      {data.lines.map((line) => (
        <div key={line.id} className="budget-line">
          <input
            className="nodrag"
            aria-label={t.budgetLineName}
            value={line.name}
            onChange={(event) => setLine(line.id, { name: event.target.value })}
          />
          <input
            className="nodrag"
            type="number"
            aria-label={t.budgetLineAmount}
            value={line.amount || ''}
            onChange={(event) => setLine(line.id, { amount: Number(event.target.value) || 0 })}
          />
          <button
            type="button"
            className="box-delete nodrag"
            aria-label={t.deleteBudgetLine(line.name)}
            onClick={() => update({ lines: data.lines.filter((other) => other.id !== line.id) })}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="input-add budget-add nodrag" onClick={addLine}>
        {t.addBudgetLine}
      </button>
      <Field label={t.budgetSum}>
        <span className="box-value">{money(spend)}</span>
      </Field>
      <Field label={t.budgetLeft}>
        <span className="box-value">{money(Math.max(0, income - spend))}</span>
      </Field>
    </BoxCard>
  );
}

function AccountCard({ id, data }: CardProps<'account'>) {
  const t = useTranslations();
  const update = useUpdate<'account'>(id);
  return (
    <BoxCard id={id} type="account" name={data.name}>
      <SelectField
        label={t.accountType}
        value={data.accountType}
        options={[
          { value: 'regular', label: t.regularAccount },
          { value: 'ask', label: t.askAccount },
        ]}
        onChange={(accountType) => update({ accountType })}
      />
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.startAmount} value={data.startAmount} onChange={(startAmount) => update({ startAmount })} />
      <DateField label={t.startDate} value={data.startDate} onChange={(startDate) => update({ startDate })} />
      <Field label={t.currency}>
        <span className="box-value">{data.currency}</span>
      </Field>
      {data.accountType === 'ask' && (
        <>
          <NumberField label={t.taxRate} value={data.taxRate} onChange={(taxRate) => update({ taxRate })} />
          <NumberField label={t.inflation} value={data.inflation} onChange={(inflation) => update({ inflation })} />
          <NumberField label={t.shieldRate} value={data.shieldRate} onChange={(shieldRate) => update({ shieldRate })} />
          <NumberField label={t.unusedShield} value={data.unusedShield} onChange={(unusedShield) => update({ unusedShield })} />
        </>
      )}
    </BoxCard>
  );
}

function ReturnCard({ id, data }: CardProps<'return'>) {
  const t = useTranslations();
  const update = useUpdate<'return'>(id);
  return (
    <BoxCard id={id} type="return" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.annualReturn} value={data.annualReturn} onChange={(annualReturn) => update({ annualReturn })} />
      <p className="box-note">{t.annualReturnNote}</p>
      <SelectField
        label={t.returnInterval}
        value={data.returnInterval}
        options={intervalOptions(t, RETURN_INTERVALS)}
        onChange={(returnInterval) => update({ returnInterval })}
      />
      <NumberField
        label={t.standardDeviation}
        value={data.standardDeviation}
        onChange={(standardDeviation) => update({ standardDeviation })}
      />
      <p className="box-note">{t.returnNote}</p>
    </BoxCard>
  );
}

function OtpCard({ id, data }: CardProps<'otp'>) {
  const t = useTranslations();
  const update = useUpdate<'otp'>(id);
  return (
    <BoxCard id={id} type="otp" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.startAmount} value={data.startAmount} onChange={(startAmount) => update({ startAmount })} />
      <DateField label={t.startDate} value={data.startDate} onChange={(startDate) => update({ startDate })} />
      <NumberField label={t.lowRate} value={data.lowRate} onChange={(lowRate) => update({ lowRate })} />
      <NumberField label={t.highRate} value={data.highRate} onChange={(highRate) => update({ highRate })} />
      <OptionalNumberField label={t.payoutAge} value={data.payoutAge} onChange={(payoutAge) => update({ payoutAge })} />
      {data.payoutAge !== null && (
        <NumberField label={t.payoutYears} value={data.payoutYears} onChange={(payoutYears) => update({ payoutYears })} />
      )}
    </BoxCard>
  );
}

function FolketrygdCard({ id, data }: CardProps<'folketrygd'>) {
  const t = useTranslations();
  const update = useUpdate<'folketrygd'>(id);
  return (
    <BoxCard id={id} type="folketrygd" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.balance} value={data.startAmount} onChange={(startAmount) => update({ startAmount })} />
      <DateField label={t.date} value={data.startDate} onChange={(startDate) => update({ startDate })} />
      <OptionalNumberField label={t.payoutAge} value={data.payoutAge} onChange={(payoutAge) => update({ payoutAge })} />
      {data.payoutAge !== null && (
        <OptionalNumberField
          label={t.divisor}
          value={data.divisor}
          placeholder={String(estimatedDivisor(data.payoutAge))}
          onChange={(divisor) => update({ divisor })}
        />
      )}
      <p className="box-note">{t.folketrygdNote}</p>
    </BoxCard>
  );
}

function WithdrawalCard({ id, data }: CardProps<'withdrawal'>) {
  const t = useTranslations();
  const update = useUpdate<'withdrawal'>(id);
  return (
    <BoxCard id={id} type="withdrawal" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <NumberField label={t.startAge} value={data.startAge} onChange={(startAge) => update({ startAge })} />
      <SelectField
        label={t.withdrawalMode}
        value={data.mode}
        options={[
          { value: 'amount', label: t.modeAmount },
          { value: 'percent', label: t.modePercent },
        ]}
        onChange={(mode) => update({ mode })}
      />
      {data.mode === 'amount' ? (
        <NumberField label={t.perMonth} value={data.perMonth} onChange={(perMonth) => update({ perMonth })} />
      ) : (
        <NumberField label={t.percent} value={data.percent} onChange={(percent) => update({ percent })} />
      )}
      <p className="box-note">{t.withdrawalNote}</p>
    </BoxCard>
  );
}

function HousingCard({ id, data }: CardProps<'housing'>) {
  const t = useTranslations();
  const update = useUpdate<'housing'>(id);
  return (
    <BoxCard id={id} type="housing" name={data.name}>
      <TextField label={t.name} value={data.name} onChange={(name) => update({ name })} />
      <SelectField
        label={t.homeKind}
        value={data.kind}
        options={[
          { value: 'primary', label: t.primaryHome },
          { value: 'secondary', label: t.secondaryHome },
          { value: 'cabin', label: t.cabin },
        ]}
        onChange={(kind) => update({ kind })}
      />
      <NumberField label={t.housingValue} value={data.value} onChange={(value) => update({ value })} />
      <NumberField label={t.loan} value={data.loan} onChange={(loan) => update({ loan })} />
      <DateField label={t.paidOff} value={data.paidOff} onChange={(paidOff) => update({ paidOff })} />
      <p className="box-note">{t.housingNote}</p>
    </BoxCard>
  );
}

function WealthTaxCard({ id, data }: CardProps<'wealthTax'>) {
  const t = useTranslations();
  const update = useUpdate<'wealthTax'>(id);
  return (
    <BoxCard id={id} type="wealthTax" name={t.wealthTax}>
      <NumberField label={t.wealthAllowance} value={data.allowance} onChange={(allowance) => update({ allowance })} />
      <NumberField label={t.wealthRate} value={data.rate} onChange={(rate) => update({ rate })} />
      <NumberField label={t.wealthHighFrom} value={data.highFrom} onChange={(highFrom) => update({ highFrom })} />
      <NumberField label={t.wealthHighRate} value={data.highRate} onChange={(highRate) => update({ highRate })} />
      <p className="box-note">{t.wealthTaxNote}</p>
    </BoxCard>
  );
}

function GCard({ id, data }: CardProps<'g'>) {
  const t = useTranslations();
  const update = useUpdate<'g'>(id);
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

function MeCard({ id, data }: CardProps<'me'>) {
  const t = useTranslations();
  const update = useUpdate<'me'>(id);
  return (
    <BoxCard id={id} type="me">
      <OptionalNumberField
        label={t.birthYear}
        value={data.birthYear || null}
        onChange={(birthYear) => update({ birthYear: birthYear ?? 0 })}
      />
      <p className="box-note">{t.meNote}</p>
    </BoxCard>
  );
}

export const nodeTypes = {
  income: IncomeCard,
  transfer: TransferCard,
  budget: BudgetCard,
  account: AccountCard,
  return: ReturnCard,
  otp: OtpCard,
  folketrygd: FolketrygdCard,
  withdrawal: WithdrawalCard,
  housing: HousingCard,
  wealthTax: WealthTaxCard,
  g: GCard,
  me: MeCard,
};
