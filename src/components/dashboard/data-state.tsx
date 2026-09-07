'use client';

import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DataStateProps {
  isLoading: boolean;
  error?: unknown;
  /** Shown only when the load succeeded and genuinely returned nothing. */
  emptyMessage: string;
  /** What failed to load, e.g. "2307 certificates". */
  subject: string;
  icon?: LucideIcon;
  onRetry?: () => void;
}

/**
 * Placeholder for a list that has no rows to show.
 *
 * A failed request must never fall through to the empty message: on a
 * collections screen "all caught up" and "the query blew up" look identical,
 * and reading a broken load as zero receivables is how money goes uncollected.
 */
export function DataState({
  isLoading,
  error,
  emptyMessage,
  subject,
  icon: Icon,
  onRetry,
}: DataStateProps) {
  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin opacity-40" />
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center text-sm">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive opacity-70" />
        <p className="font-medium text-destructive">Couldn&apos;t load {subject}.</p>
        <p className="mt-1 text-muted-foreground">
          This is a loading failure, not an empty list — the figures above are incomplete.
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      {Icon && <Icon className="mx-auto mb-2 h-8 w-8 opacity-40" />}
      {emptyMessage}
    </div>
  );
}

/**
 * KPI figures must not read as a confident zero when the load failed.
 * Returns an em dash instead of a formatted value whenever data is missing.
 */
export function statValue<T>(
  value: T | null | undefined,
  format: (v: T) => string,
  error?: unknown
): string {
  if (error || value === null || value === undefined) return '—';
  return format(value);
}
