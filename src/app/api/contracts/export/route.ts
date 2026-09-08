import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ContractStatus, Prisma } from '@/generated/prisma';
import { format } from 'date-fns';

/**
 * One CSV field. Quotes anything that could break the row, and prefixes a
 * leading =, +, - or @ so spreadsheets treat it as text rather than a formula.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  'Customer No', 'Company Name', 'Billing Entity', 'Partner', 'Product Type',
  'Status', 'Billing Type', 'Monthly Fee', 'Annual Value', 'Payment Plan',
  'Billing Day', 'Contract Start', 'Renewal Date', 'Days To Renewal',
  'Next Due Date', 'Last Payment', 'Days Overdue',
  'Contact Person', 'Email', 'All Emails', 'Mobile', 'TIN', 'Address',
  'VAT Type', 'Withholding Rate', 'Employee Count', 'Rate Per Employee',
  'Auto Send', 'Auto Approve', 'Remarks', 'Created',
];

const iso = (d: Date | null) => (d ? format(d, 'yyyy-MM-dd') : '');
const money = (d: Prisma.Decimal | number | null) =>
  d === null || d === undefined ? '' : Number(d).toFixed(2);

/**
 * GET /api/contracts/export
 * Every contract detail as CSV, honouring the same filters as the list.
 * Not paginated — an export that stopped at 50 rows would be worse than none.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const sp = new URL(request.url).searchParams;
    const status = sp.get('status');
    const billingEntity = sp.get('billingEntity');
    const productType = sp.get('productType');
    const search = sp.get('search');

    const where: Prisma.ContractWhereInput = {
      ...(status && status !== 'ALL' && { status: status as ContractStatus }),
      ...(billingEntity && billingEntity !== 'ALL' && { billingEntity: { code: billingEntity } }),
      ...(productType && productType !== 'ALL' && { productType }),
      ...(search && {
        OR: [
          { companyName: { contains: search, mode: 'insensitive' as const } },
          { customerNumber: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { tin: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const contracts = await prisma.contract.findMany({
      where,
      include: { billingEntity: true, partner: true },
      orderBy: [{ status: 'asc' }, { companyName: 'asc' }],
    });

    const today = new Date();
    const rows = contracts.map((c) => {
      const monthly = Number(c.monthlyFee);
      const annual = c.billingType === 'ONE_TIME' ? monthly : monthly * 12;
      const daysToRenewal = c.contractEndDate
        ? Math.round(
            (Date.UTC(
              c.contractEndDate.getUTCFullYear(),
              c.contractEndDate.getUTCMonth(),
              c.contractEndDate.getUTCDate()
            ) -
              Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) /
              86_400_000
          )
        : '';

      return [
        c.customerNumber, c.companyName, c.billingEntity?.code, c.partner?.code ?? 'Direct',
        c.productType, c.status, c.billingType, money(c.monthlyFee), annual.toFixed(2),
        c.paymentPlan, c.billingDayOfMonth, iso(c.contractStart), iso(c.contractEndDate),
        daysToRenewal, iso(c.nextDueDate), iso(c.lastPaymentDate), c.daysOverdue,
        c.contactPerson, c.email, c.emails, c.mobile, c.tin, c.address,
        c.vatType, c.withholdingRate === null ? '' : Number(c.withholdingRate),
        c.employeeCount, money(c.ratePerEmployee),
        c.autoSendEnabled ? 'Yes' : 'No', c.autoApprove ? 'Yes' : 'No',
        c.remarks, iso(c.createdAt),
      ].map(cell).join(',');
    });

    // BOM so Excel opens UTF-8 client names correctly.
    const csv = '﻿' + [HEADERS.map(cell).join(','), ...rows].join('\r\n');

    const entity = billingEntity && billingEntity !== 'ALL' ? billingEntity : 'ALL';
    const filename = `Contracts_${entity}_${format(today, 'yyyyMMdd')}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting contracts:', error);
    return NextResponse.json({ error: 'Failed to export contracts' }, { status: 500 });
  }
}
