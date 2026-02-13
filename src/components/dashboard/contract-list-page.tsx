'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard/header';
import { ContractTable, ContractRow } from '@/components/dashboard/contract-table';
import { ContractFormModal } from '@/components/dashboard/contract-form-modal';
import { CSVImportModal } from '@/components/dashboard/csv-import-modal';
import { DeleteConfirmationModal } from '@/components/dashboard/delete-confirmation-modal';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, Upload, Plus } from 'lucide-react';
import { useProductTypes } from '@/lib/hooks/use-api';

interface Partner {
  id: string;
  code: string;
  name: string;
  billingModel: string;
}

interface Company {
  id: string;
  code: string;
  name: string;
}

export function ContractListPage() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { data: productTypes } = useProductTypes();

  // Modal states
  const [showFormModal, setShowFormModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [contractToDelete, setContractToDelete] = useState<ContractRow | null>(null);

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

      // Handle both array response and { contracts: [] } response
      const contractList = Array.isArray(data) ? data : (data.contracts || []);

      const transformedContracts: ContractRow[] = contractList.map((contract: any) => ({
        id: contract.id,
        customerNumber: contract.customerNumber,
        customerId: contract.customerId,
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
        partner: contract.partner,
      }));

      setContracts(transformedContracts);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching contracts:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, billingEntityFilter, productTypeFilter]);

  const fetchPartnersAndCompanies = async () => {
    try {
      const [partnersRes, companiesRes] = await Promise.all([
        fetch('/api/partners'),
        fetch('/api/companies'),
      ]);

      if (partnersRes.ok) {
        const partnersData = await partnersRes.json();
        setPartners(partnersData);
      }

      if (companiesRes.ok) {
        const companiesData = await companiesRes.json();
        setCompanies(companiesData);
      }
    } catch (err) {
      console.error('Error fetching partners/companies:', err);
    }
  };

  useEffect(() => {
    fetchContracts();
    fetchPartnersAndCompanies();
  }, [fetchContracts]);

  const handleNewContract = () => {
    setSelectedContract(null);
    setShowFormModal(true);
  };

  const handleEditContract = async (contract: ContractRow) => {
    // Fetch full contract details
    try {
      const response = await fetch(`/api/contracts/${contract.id}`);
      if (response.ok) {
        const fullContract = await response.json();
        setSelectedContract(fullContract);
        setShowFormModal(true);
      }
    } catch (err) {
      console.error('Error fetching contract details:', err);
    }
  };

  const handleDeleteContract = (contract: ContractRow) => {
    setContractToDelete(contract);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!contractToDelete) return;

    const response = await fetch(`/api/contracts/${contractToDelete.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete contract');
    }

    await fetchContracts();
    setContractToDelete(null);
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
              {(productTypes || []).map(pt => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>

            <Button variant="outline" onClick={fetchContracts} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>

            <Button onClick={handleNewContract}>
              <Plus className="mr-2 h-4 w-4" />
              New Contract
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
        <ContractTable
          contracts={contracts}
          onEdit={handleEditContract}
          onDelete={handleDeleteContract}
        />

        {/* Empty state */}
        {!loading && contracts.length === 0 && !error && (
          <div className="text-center py-12 text-gray-500">
            <p>No contracts found.</p>
            <p className="mt-2">
              <button
                onClick={handleNewContract}
                className="text-blue-600 hover:underline"
              >
                Create your first contract
              </button>
              {' or '}
              <button
                onClick={() => setShowImportModal(true)}
                className="text-blue-600 hover:underline"
              >
                import from CSV
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Contract Form Modal */}
      <ContractFormModal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setSelectedContract(null);
        }}
        onSave={() => {
          fetchContracts();
        }}
        contract={selectedContract}
        partners={partners}
        companies={companies}
      />

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={fetchContracts}
        importType="contracts"
        title="Import Contracts"
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setContractToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Contract"
        message="Are you sure you want to delete this contract? This action cannot be undone."
        itemName={contractToDelete?.companyName}
      />
    </div>
  );
}
