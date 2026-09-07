'use client';

import { useState } from 'react';
import { Header } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import { RefreshCw, Loader2, FileCheck2, Receipt, Undo2 } from 'lucide-react';

type CertStatus = 'PENDING' | 'RECEIVED';

interface Certificate {
  id: string;
  billingNo: string | null;
  customerName: string;
  customerTin: string | null;
  entity: string;
  amount: number;
  withholdingCode: string | null;
  invoiceNet: number;
  paidAt: string | null;
  status: CertStatus;
  receivedAt: string | null;
  daysPending: number | null;
  bucket: string | null;
}

interface Wht2307Data {
  certificates: Certificate[];
  summary: {
    pendingCount: number;
    pendingAmount: number;
    aging: Record<string, { count: number; amount: number }>;
  };
}

const BUCKETS = [
  { key: 'd0_30', label: '0–30 days', swatch: 'bg-chart-1' },
  { key: 'd31_60', label: '31–60 days', swatch: 'bg-chart-2' },
  { key: 'd61_90', label: '61–90 days', swatch: 'bg-chart-3' },
  { key: 'd90plus', label: '90+ days', swatch: 'bg-chart-5' },
] as const;

const FILTERS: Array<{ key: 'PENDING' | 'RECEIVED' | 'ALL'; label: string }> = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'ALL', label: 'All' },
];

export function Wht2307Page() {
  const [filter, setFilter] = useState<'PENDING' | 'RECEIVED' | 'ALL'>('PENDING');
  const [updating, setUpdating] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useApi<Wht2307Data>(
    `/api/collections/wht2307?status=${filter}`
  );

  const setStatus = async (cert: Certificate, next: CertStatus) => {
    const verb = next === 'RECEIVED' ? 'Mark the 2307 as received' : 'Move this 2307 back to pending';
    if (!window.confirm(
      `${verb} for ${cert.customerName} (${cert.billingNo ?? ''}) — ${formatCurrency(cert.amount)}?`
    )) return;
    setUpdating(cert.id);
    try {
      const res = await fetch(`/api/invoices/${cert.id}/wht2307`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to update');
      mutate();
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : e}`);
    } finally {
      setUpdating(null);
    }
  };

  const rows = data?.certificates ?? [];
  const summary = data?.summary;

  return (
    <div className="flex flex-col">
      <Header
        title="2307 Certificates"
        subtitle="Creditable withholding tax certificates owed to us by clients"
      />

      <div className="flex-1 space-y-6 p-6">
        {/* Outstanding value + aging */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Certificates Outstanding
              </CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summary ? formatCurrency(summary.pendingAmount) : '—'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary?.pendingCount ?? 0} certificate{summary?.pendingCount === 1 ? '' : 's'} not yet received
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                How long they&apos;ve been outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-4">
                {BUCKETS.map((b) => {
                  const stat = summary?.aging?.[b.key];
                  return (
                    <div key={b.key} className="rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-sm ${b.swatch}`} aria-hidden />
                        <span className="text-xs font-medium text-muted-foreground">{b.label}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold">
                        {formatCurrency(stat?.amount ?? 0)}
                      </div>
                      <div className="text-xs text-muted-foreground">{stat?.count ?? 0} cert.</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={filter === f.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
            {isLoading && <Loader2 className="ml-1 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Failed to load 2307 certificates.
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            {rows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client / Invoice</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>TIN</TableHead>
                    <TableHead className="text-right">Certificate value</TableHead>
                    <TableHead>Invoice settled</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((cert) => (
                    <TableRow key={cert.id}>
                      <TableCell>
                        <div className="font-medium">{cert.customerName}</div>
                        <div className="text-xs text-muted-foreground">
                          {cert.billingNo ?? cert.id.slice(0, 8)}
                          {cert.withholdingCode ? ` · ${cert.withholdingCode}` : ''}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{cert.entity}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {cert.customerTin || '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(cert.amount)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {cert.paidAt ? formatDateShort(new Date(cert.paidAt)) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {cert.status === 'PENDING' ? (
                          <Badge variant={(cert.daysPending ?? 0) > 60 ? 'destructive' : 'warning'}>
                            {cert.daysPending}d
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            received{cert.receivedAt ? ` ${formatDateShort(new Date(cert.receivedAt))}` : ''}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {cert.status === 'PENDING' ? (
                          <Button
                            size="sm"
                            disabled={updating === cert.id}
                            onClick={() => setStatus(cert, 'RECEIVED')}
                            className="bg-green-600 text-white hover:bg-green-700"
                          >
                            <FileCheck2 className="mr-1 h-4 w-4" />
                            {updating === cert.id ? 'Saving…' : 'Mark received'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updating === cert.id}
                            onClick={() => setStatus(cert, 'PENDING')}
                            title="Undo — move back to pending"
                          >
                            <Undo2 className="mr-1 h-4 w-4" />
                            Undo
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Receipt className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {isLoading
                  ? 'Loading…'
                  : filter === 'PENDING'
                    ? 'No certificates outstanding — every 2307 is accounted for.'
                    : 'Nothing to show for this filter.'}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          A 2307 is owed whenever a client withholds tax on payment. Each one is a creditable tax
          asset, so chase the old ones — anything past 60 days is flagged red.
        </p>
      </div>
    </div>
  );
}
