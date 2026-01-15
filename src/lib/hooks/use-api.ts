'use client';

import useSWR, { SWRConfiguration } from 'swr';

// Global fetcher function
const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error('An error occurred while fetching the data.');
    throw error;
  }
  return res.json();
};

// Default SWR config for the app
const defaultConfig: SWRConfiguration = {
  revalidateOnFocus: false, // Don't refetch when window regains focus
  revalidateIfStale: true,  // Revalidate if data is stale
  dedupingInterval: 5000,   // Dedupe requests within 5 seconds
};

// Hook for fetching invoices
export function useInvoices(status?: string, options?: SWRConfiguration) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const url = `/api/invoices${params.toString() ? `?${params.toString()}` : ''}`;

  return useSWR(url, fetcher, { ...defaultConfig, ...options });
}

// Hook for fetching stats
export function useStats(options?: SWRConfiguration) {
  return useSWR('/api/stats', fetcher, { ...defaultConfig, ...options });
}

// Hook for fetching contracts
export function useContracts(options?: SWRConfiguration) {
  return useSWR('/api/contracts', fetcher, { ...defaultConfig, ...options });
}

// Hook for fetching partners
export function usePartners(options?: SWRConfiguration) {
  return useSWR('/api/partners', fetcher, { ...defaultConfig, ...options });
}

// Hook for fetching companies
export function useCompanies(options?: SWRConfiguration) {
  return useSWR('/api/companies', fetcher, { ...defaultConfig, ...options });
}

// Generic hook for any API endpoint
export function useApi<T = any>(url: string | null, options?: SWRConfiguration) {
  return useSWR<T>(url, fetcher, { ...defaultConfig, ...options });
}
