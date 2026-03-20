import type { Contract, Company, Partner } from '@/generated/prisma';

const SYNC_URL = 'https://intent-yak-558.convex.site';

type ContractWithRelations = Contract & {
  billingEntity: Company;
  partner?: Partner | null;
};

function mapEntityCode(billingEntity: Company): string {
  const name = billingEntity.name.toUpperCase();
  if (name.includes('ABBA')) return 'ABBA';
  return 'YAHSHUA';
}

function buildPayload(contract: ContractWithRelations) {
  return {
    customerNumber: contract.customerNumber,
    companyName: contract.companyName,
    monthlyFee: Number(contract.monthlyFee ?? 0),
    paymentPlan: contract.paymentPlan,
    contractStart: contract.contractStart?.toISOString().split('T')[0] ?? null,
    contractEndDate: contract.contractEndDate?.toISOString().split('T')[0] ?? null,
    status: contract.status,
    entity: mapEntityCode(contract.billingEntity),
    billingDayOfMonth: contract.billingDayOfMonth,
    partnerName: contract.partner?.name ?? null,
    remarks: contract.remarks,
    id: contract.id,
    bankAccount: 'Main Account',
  };
}

export function syncContractToCashManagement(contract: ContractWithRelations): void {
  if (!contract.customerNumber) return;

  const apiKey = process.env.CASH_MGMT_SYNC_KEY;
  if (!apiKey) {
    console.error('[cash-mgmt-sync] CASH_MGMT_SYNC_KEY is not set');
    return;
  }

  const payload = buildPayload(contract);

  fetch(`${SYNC_URL}/sync-contract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[cash-mgmt-sync] Failed for ${contract.customerNumber}: ${res.status} ${text}`);
      }
    })
    .catch((err) => {
      console.error(`[cash-mgmt-sync] Error syncing ${contract.customerNumber}:`, err);
    });
}

export function syncContractsBatchToCashManagement(contracts: ContractWithRelations[]): void {
  const eligible = contracts.filter((c) => c.customerNumber);
  if (eligible.length === 0) return;

  const apiKey = process.env.CASH_MGMT_SYNC_KEY;
  if (!apiKey) {
    console.error('[cash-mgmt-sync] CASH_MGMT_SYNC_KEY is not set');
    return;
  }

  const payload = eligible.map(buildPayload);

  fetch(`${SYNC_URL}/sync-contracts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[cash-mgmt-sync] Batch sync failed: ${res.status} ${text}`);
      }
    })
    .catch((err) => {
      console.error('[cash-mgmt-sync] Batch sync error:', err);
    });
}
