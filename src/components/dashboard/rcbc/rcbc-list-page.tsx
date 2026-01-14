'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard/header';
import { RcbcClientFormModal } from './rcbc-client-form-modal';
import { CSVImportModal } from '@/components/dashboard/csv-import-modal';
import { DeleteConfirmationModal } from '@/components/dashboard/delete-confirmation-modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  Loader2,
  Upload,
  Plus,
  Pencil,
  Trash2,
  FileText,
  Building2,
  Users,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface RcbcClient {
  id: string;
  name: string;
  employeeCount: number;
  ratePerEmployee: number;
  month: string;
  isActive: boolean;
}

interface RcbcSummary {
  month: string;
  monthLabel: string;
  totalClients: number;
  totalEmployees: number;
  serviceFee: number;
  vatAmount: number;
  grossAmount: number;
  withholdingTax: number;
  netAmount: number;
}

export function RcbcListPage() {
  const [clients, setClients] = useState<RcbcClient[]>([]);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [summary, setSummary] = useState<RcbcSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab state
  const [activeTab, setActiveTab] = useState<'master' | 'billing'>('master');

  // Filter state
  const [selectedMonth, setSelectedMonth] = useState<string>('');

  // Modal states
  const [showFormModal, setShowFormModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState<RcbcClient | null>(null);
  const [clientToDelete, setClientToDelete] = useState<RcbcClient | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedMonth) params.set('month', selectedMonth);

      const url = `/api/rcbc/clients${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch RCBC clients');

      const data = await response.json();
      setClients(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching RCBC clients:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  const fetchAvailableMonths = async () => {
    try {
      const response = await fetch('/api/rcbc/summary');
      if (response.ok) {
        const data = await response.json();
        setAvailableMonths(data.months || []);
        // Set default month to first available or current month
        if (data.months?.length > 0) {
          setSelectedMonth(data.months[0]);
        } else {
          setSelectedMonth(new Date().toISOString().slice(0, 7));
        }
      }
    } catch (err) {
      console.error('Error fetching available months:', err);
    }
  };

  const fetchSummary = useCallback(async () => {
    if (!selectedMonth) return;

    try {
      const response = await fetch(`/api/rcbc/summary?month=${selectedMonth}`);
      if (response.ok) {
        const data = await response.json();
        setSummary(data);
      } else {
        setSummary(null);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
      setSummary(null);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchAvailableMonths();
  }, []);

  useEffect(() => {
    fetchClients();
    fetchSummary();
  }, [fetchClients, fetchSummary]);

  const handleNewClient = () => {
    setSelectedClient(null);
    setShowFormModal(true);
  };

  const handleEditClient = (client: RcbcClient) => {
    setSelectedClient(client);
    setShowFormModal(true);
  };

  const handleDeleteClient = (client: RcbcClient) => {
    setClientToDelete(client);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!clientToDelete) return;

    const response = await fetch(`/api/rcbc/clients/${clientToDelete.id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete client');
    }

    await fetchClients();
    await fetchSummary();
    setClientToDelete(null);
  };

  const handleDeleteAll = async () => {
    if (!selectedMonth || clients.length === 0) return;

    setIsDeletingAll(true);
    try {
      const response = await fetch(`/api/rcbc/clients?month=${selectedMonth}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete clients');
      }

      await fetchClients();
      await fetchSummary();
      await fetchAvailableMonths();
      setShowDeleteAllModal(false);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedMonth || !summary) return;

    if (!confirm(`Generate RCBC invoice for ${summary.monthLabel}? This will create a consolidated invoice for ${summary.totalClients} clients.`)) {
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/rcbc/generate-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate invoice');
      }

      alert(`Invoice generated successfully! Check the Pending Approval page.`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefresh = () => {
    fetchClients();
    fetchSummary();
  };

  // Format month for display
  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const tabClassName = (tab: 'master' | 'billing') =>
    `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
      activeTab === tab
        ? 'bg-white text-blue-600 border-blue-600'
        : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
    }`;

  return (
    <div className="flex flex-col">
      <Header title="RCBC Management" subtitle="Manage RCBC end-clients and consolidated billing" />

      <div className="flex-1 space-y-6 p-6">
        {/* Actions bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              RCBC End-Clients
              {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            </h2>
            <span className="text-sm text-gray-500">
              ({clients.length} client{clients.length !== 1 ? 's' : ''})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Month filter */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {availableMonths.map(month => (
                <option key={month} value={month}>{formatMonth(month)}</option>
              ))}
              {/* Add current month if not in list */}
              {!availableMonths.includes(new Date().toISOString().slice(0, 7)) && (
                <option value={new Date().toISOString().slice(0, 7)}>
                  {formatMonth(new Date().toISOString().slice(0, 7))} (New)
                </option>
              )}
            </select>

            <Button variant="outline" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Button variant="outline" onClick={() => setShowImportModal(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>

            {clients.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowDeleteAllModal(true)}
                className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete All
              </Button>
            )}

            <Button onClick={handleNewClient}>
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button className={tabClassName('master')} onClick={() => setActiveTab('master')}>
            <Building2 className="inline h-4 w-4 mr-1" />
            Master List
          </button>
          <button className={tabClassName('billing')} onClick={() => setActiveTab('billing')}>
            <FileText className="inline h-4 w-4 mr-1" />
            Monthly Billing
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Master List Tab */}
        {activeTab === 'master' && (
          <div className="rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-gray-500">
                      No RCBC clients found for this month
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">{client.name}</TableCell>
                      <TableCell className="text-right">{client.employeeCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatCurrency(client.ratePerEmployee)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(client.employeeCount * client.ratePerEmployee)}
                      </TableCell>
                      <TableCell>{formatMonth(typeof client.month === 'string' ? client.month.slice(0, 7) : new Date(client.month).toISOString().slice(0, 7))}</TableCell>
                      <TableCell>
                        <Badge variant={client.isActive ? 'success' : 'secondary'}>
                          {client.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEditClient(client)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit Client"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClient(client)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete Client"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Monthly Billing Tab */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            {summary ? (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <Building2 className="h-4 w-4" />
                      Total Clients
                    </div>
                    <div className="text-2xl font-bold">{summary.totalClients}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <Users className="h-4 w-4" />
                      Total Employees
                    </div>
                    <div className="text-2xl font-bold">{summary.totalEmployees.toLocaleString()}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                      <DollarSign className="h-4 w-4" />
                      Service Fee
                    </div>
                    <div className="text-2xl font-bold">{formatCurrency(summary.serviceFee)}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-4 bg-green-50">
                    <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
                      <DollarSign className="h-4 w-4" />
                      Net Amount
                    </div>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.netAmount)}</div>
                  </div>
                </div>

                {/* Billing Breakdown */}
                <div className="bg-white rounded-lg border p-6">
                  <h3 className="text-lg font-semibold mb-4">Billing Summary for {summary.monthLabel}</h3>

                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">Service Fee ({summary.totalClients} clients)</span>
                      <span className="font-medium">{formatCurrency(summary.serviceFee)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">VAT (12%)</span>
                      <span className="font-medium">+ {formatCurrency(summary.vatAmount)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">Gross Amount</span>
                      <span className="font-medium">{formatCurrency(summary.grossAmount)}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">Withholding Tax (2%)</span>
                      <span className="font-medium text-red-600">- {formatCurrency(summary.withholdingTax)}</span>
                    </div>
                    <div className="flex justify-between py-3 text-lg font-bold">
                      <span>Net Amount</span>
                      <span className="text-green-600">{formatCurrency(summary.netAmount)}</span>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t">
                    <Button
                      size="lg"
                      onClick={handleGenerateInvoice}
                      disabled={isGenerating || summary.totalClients === 0}
                      className="w-full"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Generating Invoice...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-5 w-5" />
                          Generate RCBC Invoice for {summary.monthLabel}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No billing data available for the selected month.</p>
                <p className="mt-2">
                  <button
                    onClick={handleNewClient}
                    className="text-blue-600 hover:underline"
                  >
                    Add RCBC clients
                  </button>
                  {' to generate billing.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RCBC Client Form Modal */}
      <RcbcClientFormModal
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setSelectedClient(null);
        }}
        onSave={() => {
          fetchClients();
          fetchSummary();
        }}
        client={selectedClient}
        defaultMonth={selectedMonth}
      />

      {/* CSV Import Modal */}
      <CSVImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          fetchClients();
          fetchSummary();
          fetchAvailableMonths();
        }}
        importType="rcbc-clients"
        title="Import RCBC Clients"
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setClientToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete RCBC Client"
        message="Are you sure you want to delete this RCBC client? This action cannot be undone."
        itemName={clientToDelete?.name}
      />

      {/* Delete All Confirmation Modal */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !isDeletingAll && setShowDeleteAllModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Delete All Clients</h3>
            </div>
            <p className="text-gray-600 mb-2">
              Are you sure you want to delete <strong>all {clients.length} RCBC client(s)</strong> for{' '}
              <strong>{formatMonth(selectedMonth)}</strong>?
            </p>
            <p className="text-red-600 text-sm mb-6">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={isDeletingAll}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAll}
                disabled={isDeletingAll}
              >
                {isDeletingAll ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete All
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
