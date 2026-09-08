import { cn } from '@/lib/utils';

/**
 * The mark: a soft ring holding three line items of decreasing length — a
 * statement and a coin in one shape.
 *
 * Single colour via `currentColor`, so it inherits the surrounding text colour
 * and needs no separate light/dark asset. Drawn on a 32×32 grid with a 3px
 * stroke, which stays legible down to 16px.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('h-7 w-7', className)}
      role="img"
      aria-label="YAHSHUA-ABBA Billing Agent"
    >
      <circle cx="16" cy="16" r="12.6" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="9.4" y="10.6" width="13.2" height="2.7" rx="1.35" fill="currentColor" />
      <rect x="9.4" y="14.7" width="13.2" height="2.7" rx="1.35" fill="currentColor" />
      <rect x="9.4" y="18.8" width="7.4" height="2.7" rx="1.35" fill="currentColor" />
    </svg>
  );
}

/** Mark plus name, for the expanded sidebar and the login card. */
export function Logo({
  className,
  markClassName,
  subtitle = 'Billing Agent',
}: {
  className?: string;
  markClassName?: string;
  subtitle?: string | null;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark className={markClassName} />
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-tight">YAHSHUA-ABBA</span>
        {subtitle && (
          <span className="block text-[10px] tracking-wide text-muted-foreground">{subtitle}</span>
        )}
      </span>
    </div>
  );
}
