'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard/header';
import { ContractTable, ContractRow } from '@/components/dashboard/contract-table';
import { ContractSettingsModal, ContractForSettings } from '@/components/dashboard/contract-settings-modal';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, CloudDownload } from 'lucide-react';

export function ContractListPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractForSettings | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [billingEntityFilter, setBillingEntityFilter] = useState<string>('');
  const [productTypeFilter, setProductTypeFilter] = useState<string>('');

  const fetchContracts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (billingEntityFilter) params.set('billingEntity', billingEntityFilter);
      if (productTypeFilter) params.set('productType', productTypeFilter);

      const url = `/api/contracts${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch contracts');

      const data = await response.json();

      const transformedContracts: ContractRow[] = data.map((contract: any) => ({
        id: contract.id,
        companyName: contract.companyName,
        productType: contract.productType,
        monthlyFee: Number(contract.monthlyFee),
        status: contract.status,
        nextDueDate: contract.nextDueDate ? new Date(contract.nextDueDate) : null,
        billingEntity: contract.billingEntity?.code || 'YOWI',
        contactPerson: contract.contactPerson,
        email: contract.email,
        paymentPlan: contract.paymentPlan,
        autoSendEnabled: contract.autoSendEnabled ?? true,
        contractEndDate: contract.contractEndDate ? new Date(contract.contractEndDate) : null,
      }));

      setContracts(transformedContracts);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching contracts:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, billingEntityFilter, productTypeFilter]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const handleSync = async () => {
    if (!confirm('Sync contracts from Google Sheets? This will update existing contracts and add new ones.')) {
      return;
    }

    try {
      setSyncing(true);
      const response = await fetch('/api/sync?type=contracts', {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Sync failed');

      const result = await response.json();
      const contractsResult = result.data?.contracts || result.contracts || {};
      alert(`Sync complete!\nCreated: ${contractsResult.created || 0}\nUpdated: ${contractsResult.updated || 0}\nSkipped: ${contractsResult.skipped || 0}`);
      await fetchContracts();
    } catch (err: any) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleContractClick = (contract: ContractRow) => {
    setSelectedContract({
      id: contract.id,
      companyName: contract.companyName,
      autoSendEnabled: contract.autoSendEnabled,
      contractEndDate: contract.contractEndDate,
    });
  };

  const handleSaveSettings = async (
    contractId: string,
    data: { autoSendEnabled: boolean; contractEndDate: string | null }
  ) => {
    const response = await fetch(`/api/contracts/${contractId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update contract');
    }

    // Refresh the list after saving
    await fetchContracts();
  };

  const selectClassName = "h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="flex flex-col">
      <Header title="Contracts" subtitle="Manage client contracts and billing agreements" />

      <div className="flex-1 space-y-6 p-6">
        {/* Actions bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              All Contracts
              {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            </h2>
            <span className="text-sm text-gray-500">
              ({contracts.length} contract{contracts.length !== 1 ? 's' : ''})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filters */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={selectClassName}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="STOPPED">Stopped</option>
              <option value="NOT_STARTED">Not Started</option>
            </select>

            <select
              value={billingEntityFilter}
              onChange={(e) => setBillingEntityFilter(e.target.value)}
              className={selectClassName}
            >
              <option value="">All Entities</option>
              <option value="YOWI">YOWI</option>
              <option value="ABBA">ABBA</option>
            </select>

            <select
              value={productTypeFilter}
              onChange={(e) => setProductTypeFilter(e.target.value)}
              className={selectClassName}
            >
              <option value="">All Products</option>
              <option value="ACCOUNTING">Accounting</option>
              <option value="PAYROLL">Payroll</option>
              <option value="COMPLIANCE">Compliance</option>
              <option value="HR">HR</option>
            </select>

            <Button variant="outline" onClick={fetchContracts} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="mr-2 h-4 w-4" />
              )}
              {syncing ? 'Syncing...' : 'Sync from Sheets'}
            </Button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Contract Table */}
        <ContractTable contracts={contracts} onContractClick={handleContractClick} />

        {/* Empty state */}
        {!loading && contracts.length === 0 && !error && (
          <div className="text-center py-12 text-gray-500">
            No contracts found. Try adjusting your filters or sync from Google Sheets.
          </div>
        )}
      </div>

      {/* Contract Settings Modal */}
      <ContractSettingsModal
        contract={selectedContract}
        isOpen={!!selectedContract}
        onClose={() => setSelectedContract(null)}
        onSave={handleSaveSettings}
      />
    </div>
  );
}
