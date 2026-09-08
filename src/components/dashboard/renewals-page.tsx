'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/dashboard/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/hooks/use-api';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import { DataState, statValue } from '@/components/dashboard/data-state';
import { RefreshCw, Loader2, CalendarClock, AlertTriangle, HelpCircle } from 'lucide-react';

type Stage = 'overdue' | 'due' | 'soon' | 'later';

interface Renewal {
  id: string;
  companyName: string;
  productType: string;
  entity: string;
  monthlyFee: number;
  contractEndDate: string;
  daysUntil: number;
  stage: Stage;
  contactPerson: string | null;
  email: string | null;
  noticeSentAt: string | null;
}

interface RenewalData {
  leadDays: number;
  renewals: Renewal[];
  missingEndDate: { id: string; companyName: string; entity: string; monthlyFee: number }[];
  counts: Record<Stage, number>;
  missingCount: number;
}

const TABS: Array<{ key: Stage | 'all'; label: string }> = [
  { key: 'due', label: 'Needs action' },
  { key: 'overdue', label: 'Lapsed' },
  { key: 'soon', label: 'Coming up' },
  { key: 'later', label: 'Later' },
  { key: 'all', label: 'All' },
];

const STAGE_BADGE: Record<Stage, { variant: 'destructive' | 'warning' | 'success' | 'outline'; label: string }> = {
  overdue: { variant: 'destructive', label: 'lapsed' },
  due: { variant: 'warning', label: 'due' },
  soon: { variant: 'outline', label: 'coming up' },
  later: { variant: 'outline', label: 'later' },
};

export function RenewalsPage() {
  const [tab, setTab] = useState<Stage | 'all'>('due');
  const { data, error, isLoading, mutate } = useApi<RenewalData>('/api/renewals');

  const rows = (data?.renewals ?? []).filter((r) => tab === 'all' || r.stage === tab);
  const leadDays = data?.leadDays ?? 45;
  const atRiskValue = (data?.renewals ?? [])
    .filter((r) => r.stage === 'due' || r.stage === 'overdue')
    .reduce((s, r) => s + r.monthlyFee, 0);

  return (
    <div className="flex flex-col">
      <Header
        title="Renewals"
        subtitle={`Contracts approaching their end date — reminders fire ${leadDays} days ahead`}
      />

      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Needs action
              </CardTitle>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.counts.due, (n) => String(n), error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : `within ${leadDays} days · ${formatCurrency(atRiskValue)}/mo at stake`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Lapsed</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.counts.overdue, (n) => String(n), error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : 'end date already passed'}
              </p>
            </CardContent>
          </Card>

          <Card className={data?.missingCount ? 'border-destructive/40' : undefined}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                No renewal date
              </CardTitle>
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statValue(data?.missingCount, (n) => String(n), error)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {error ? 'Figure unavailable' : 'active contracts nobody can be reminded about'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <Button
                key={t.key}
                variant={tab === t.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {data && t.key !== 'all' && (
                  <span className="ml-2 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                    {data.counts[t.key as Stage]}
                  </span>
                )}
              </Button>
            ))}
            {isLoading && <Loader2 className="ml-1 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <Button variant="outline" onClick={() => mutate()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {rows.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead className="text-right">Monthly fee</TableHead>
                    <TableHead>Renews</TableHead>
                    <TableHead className="text-right">Countdown</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Reminded</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.companyName}</div>
                        <div className="text-xs text-muted-foreground">{r.productType}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{r.entity}</Badge></TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(r.monthlyFee)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateShort(new Date(r.contractEndDate))}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={STAGE_BADGE[r.stage].variant}>
                          {r.daysUntil < 0
                            ? `${Math.abs(r.daysUntil)}d ago`
                            : r.daysUntil === 0
                              ? 'today'
                              : `${r.daysUntil}d`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{r.contactPerson || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.email || 'no email'}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.noticeSentAt ? formatDateShort(new Date(r.noticeSentAt)) : 'not yet'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <DataState
                isLoading={isLoading}
                error={error}
                subject="renewals"
                icon={CalendarClock}
                onRetry={() => mutate()}
                emptyMessage={
                  tab === 'due'
                    ? `Nothing renewing in the next ${leadDays} days.`
                    : 'Nothing in this group.'
                }
              />
            )}
          </CardContent>
        </Card>

        {/* The real risk isn't a renewal we can see — it's one we can't. */}
        {!!data?.missingEndDate.length && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base">
                {data.missingEndDate.length} active contract
                {data.missingEndDate.length === 1 ? '' : 's'} with no renewal date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                These can never trigger a reminder — nobody will be told when they lapse. Open each
                contract and set its renewal date.
              </p>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead className="text-right">Monthly fee</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.missingEndDate.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.companyName}</TableCell>
                        <TableCell><Badge variant="outline">{c.entity}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(c.monthlyFee)}</TableCell>
                        <TableCell className="text-right">
                          <Link
                            href="/dashboard/contracts"
                            className="text-sm text-primary underline-offset-4 hover:underline"
                          >
                            Set date
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          The nightly job raises one in-app reminder per renewal, {leadDays} days out — it never
          emails the client, since the renewal conversation is yours to start. Change the lead time
          with the <code>renewals.leadDays</code> setting.
        </p>
      </div>
    </div>
  );
}
