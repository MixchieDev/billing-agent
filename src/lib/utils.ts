import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Decimal } from '@prisma/client/runtime/library';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Currency formatting for Philippine Peso
export function formatCurrency(amount: number | Decimal | null | undefined): string {
  if (amount === null || amount === undefined) return 'P 0.00';
  const num = typeof amount === 'number' ? amount : Number(amount);
  return `P ${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Date formatting
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// Calculate days until a date
export function daysUntil(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = d.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Billing calculation utilities
export interface BillingCalculation {
  serviceFee: number;
  vatAmount: number;
  grossAmount: number;
  withholdingTax: number;
  netAmount: number;
}

export function calculateBilling(
  amount: number,
  isVatInclusive: boolean = true,
  isVatClient: boolean = true,
  hasWithholding: boolean = false
): BillingCalculation {
  let serviceFee: number;
  let vatAmount: number;
  let grossAmount: number;
  let withholdingTax: number;
  let netAmount: number;

  if (isVatClient) {
    if (isVatInclusive) {
      // VAT-inclusive: amount already includes VAT
      serviceFee = amount / 1.12;
      vatAmount = serviceFee * 0.12;
    } else {
      // VAT-exclusive: add VAT to amount
      serviceFee = amount;
      vatAmount = serviceFee * 0.12;
    }
  } else {
    // Non-VAT client
    serviceFee = amount;
    vatAmount = 0;
  }

  grossAmount = serviceFee + vatAmount;

  if (hasWithholding) {
    withholdingTax = serviceFee * 0.02; // 2% EWT
  } else {
    withholdingTax = 0;
  }

  netAmount = grossAmount - withholdingTax;

  return {
    serviceFee: Math.round(serviceFee * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    grossAmount: Math.round(grossAmount * 100) / 100,
    withholdingTax: Math.round(withholdingTax * 100) / 100,
    netAmount: Math.round(netAmount * 100) / 100,
  };
}

// Determine billing entity based on partner
export function getBillingEntity(partner: string | null | undefined): 'YOWI' | 'ABBA' {
  const yowiPartners = ['Globe', 'Innove', 'RCBC', 'Direct-YOWI'];
  if (!partner) return 'ABBA';
  return yowiPartners.some(p => partner.toLowerCase().includes(p.toLowerCase())) ? 'YOWI' : 'ABBA';
}

// Period description for emails
export function getPeriodDescription(
  billingType: 'monthly' | 'annual',
  periodStart?: Date,
  periodEnd?: Date
): string {
  if (billingType === 'monthly') {
    const date = periodStart || new Date();
    return `the month of ${date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`;
  } else {
    const start = periodStart || new Date();
    const end = periodEnd || new Date(start.getFullYear(), 11, 31);
    return `the year ${start.getFullYear()} (${start.toLocaleDateString('en-PH', { month: 'long' })} - ${end.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })})`;
  }
}

// Generate billing number
export function generateBillingNo(prefix: string, sequence: number): string {
  return `${prefix}-${new Date().getFullYear()}-${sequence.toString().padStart(5, '0')}`;
}
