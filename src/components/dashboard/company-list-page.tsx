'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/dashboard/header';
import { CompanyCard, CompanyData } from '@/components/dashboard/company-card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

export function CompanyListPage() {
  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/companies');
      if (!response.ok) throw new Error('Failed to fetch companies');

      const data = await response.json();
      setCompanies(data);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching companies:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleSave = async (code: string, data: Partial<CompanyData>) => {
    const response = await fetch(`/api/companies/${code}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to save company');
    }

    // Refresh data after save
    await fetchCompanies();
    alert('Company updated successfully!');
  };

  return (
    <div className="flex flex-col">
      <Header title="Companies" subtitle="Manage YOWI and ABBA billing entities" />

      <div className="flex-1 space-y-6 p-6">
        {/* Actions bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              Billing Entities
              {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />}
            </h2>
          </div>

          <Button variant="outline" onClick={fetchCompanies} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 text-red-700">
            Error: {error}
          </div>
        )}

        {/* Company Cards */}
        {!loading && companies.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {companies.map((company) => (
              <CompanyCard
                key={company.id}
                company={company}
                onSave={handleSave}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && companies.length === 0 && !error && (
          <div className="text-center py-12 text-gray-500">
            No companies found. Please ensure YOWI and ABBA companies are created in the database.
          </div>
        )}
      </div>
    </div>
  );
}
