'use client';

import { useApi } from '@/lib/hooks/use-api';
import { RECEIVED_IN_NONE, receivedInKey } from '@/lib/received-in';

interface BankAccountRow {
  entity: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
}

interface ReceivedInFilterProps {
  value: string; // '' = all accounts
  onChange: (value: string) => void;
  /** Entity code to limit the list to, or 'ALL'. */
  entity?: string;
  className?: string;
}

/** Bank-account filter: invoices with a payment received in the chosen account. */
export function ReceivedInFilter({ value, onChange, entity = 'ALL', className }: ReceivedInFilterProps) {
  const { data } = useApi<{ accounts: BankAccountRow[] }>('/api/bank-accounts');
  const accounts = (data?.accounts ?? []).filter((a) => entity === 'ALL' || a.entity === entity);
  const entities = Array.from(new Set(accounts.map((a) => a.entity)));

  const label = (a: BankAccountRow) =>
    `${a.bankName}${a.bankAccountNo ? ` · ${a.bankAccountNo}` : ''}`;

  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">All Bank Accounts</option>
      {entities.length > 1
        ? entities.map((ent) => (
            <optgroup key={ent} label={ent}>
              {accounts
                .filter((a) => a.entity === ent)
                .map((a) => (
                  <option key={receivedInKey(a)} value={receivedInKey(a)}>
                    {label(a)}
                  </option>
                ))}
            </optgroup>
          ))
        : accounts.map((a) => (
            <option key={receivedInKey(a)} value={receivedInKey(a)}>
              {label(a)}
            </option>
          ))}
      <option value={RECEIVED_IN_NONE}>Account not recorded</option>
    </select>
  );
}
