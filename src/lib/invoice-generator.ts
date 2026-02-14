import prisma from './prisma';
import { calculateBilling, generateBillingNo } from './utils';
import { BillingModel, InvoiceStatus, VatType, BillingFrequency } from '@/generated/prisma';
import {
  getScheduledBilling,
  createScheduledBillingRun,
  updateNextBillingDate,
  checkExistingInvoiceForPeriod,
} from './scheduled-billing-service';
import { getVatRate, getProductTypes } from './settings';
import { format } from 'date-fns';

// ==================== TYPES ====================

export interface CustomBillTo {
  name: string;
  attention?: string;
  address?: string;
  email?: string;    // Single email (legacy)
  emails?: string;   // Comma-separated list of emails
  tin?: string;
}

export interface LineItemInput {
  description: string;
  amount: number;
  periodStart?: Date;
  periodEnd?: Date;
  discountType?: 'PERCENTAGE' | 'FIXED' | null;
  discountValue?: number;
}

export interface GenerateInvoiceRequest {
  // Source (pick one)
  contractId?: string;
  scheduledBillingId?: string;
  customBillTo?: CustomBillTo;

  // Required
  billingEntityId: string;
  billingAmount: number;
  dueDate: Date;

  // Optional
  vatType?: VatType;
  hasWithholding?: boolean;
  withholdingRate?: number;  // Rate as decimal (e.g., 0.02 = 2%)
  withholdingCode?: string;  // ATC code (e.g., 'WC160')
  periodStart?: Date;
  periodEnd?: Date;
  autoApprove?: boolean;

  // Editable text fields
  description?: string;    // Line item description (for single item)
  remarks?: string;        // Invoice remarks/notes

  // Multiple line items (for multi-month billing)
  lineItems?: LineItemInput[];
}

export interface GenerateInvoiceResult {
  invoice: {
    id: string;
    billingNo: string;
    status: InvoiceStatus;
    netAmount: number;
    customerName: string;
  };
  autoApproved: boolean;
  scheduledBillingId?: string;
}

// ==================== MAIN FUNCTIONS ====================

/**
 * Generate an invoice from a request (ad-hoc or scheduled)
 */
export async function generateInvoice(
  request: GenerateInvoiceRequest
): Promise<GenerateInvoiceResult> {
  // Validate request
  if (!request.contractId && !request.scheduledBillingId && !request.customBillTo) {
    throw new Error('Must provide contractId, scheduledBillingId, or customBillTo');
  }

  // Get billing entity
  const billingEntity = await prisma.company.findUnique({
    where: { id: request.billingEntityId },
    include: { template: true },
  });

  if (!billingEntity) {
    throw new Error('Billing entity not found');
  }

  // Determine invoice recipient and contract details
  let customerName: string;
  let attention: string | null = null;
  let customerAddress: string | null = null;
  let customerEmail: string | null = null;
  let customerEmails: string | null = null;  // Comma-separated list
  let customerTin: string | null = null;
  let partnerId: string | null = null;
  let billingModel: BillingModel = BillingModel.DIRECT;
  let contractId: string | null = null;
  let description = request.description || 'Professional Services';
  let invoiceProductType: string | null = null;

  if (request.contractId) {
    // Generate from contract
    const contract = await prisma.contract.findUnique({
      where: { id: request.contractId },
      include: { partner: true },
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    contractId = contract.id;
    invoiceProductType = contract.productType;
    customerTin = contract.tin;

    // Determine recipient based on partner billing model
    if (contract.partner) {
      partnerId = contract.partnerId;
      billingModel = contract.partner.billingModel;

      if (contract.partner.billingModel === BillingModel.GLOBE_INNOVE ||
          contract.partner.billingModel === BillingModel.RCBC_CONSOLIDATED) {
        customerName = contract.partner.invoiceTo || contract.companyName;
        attention = contract.partner.attention;
        customerAddress = contract.partner.address;
        // Use emails field if available, fallback to email
        customerEmails = contract.partner.emails || contract.partner.email;
        customerEmail = customerEmails?.split(',')[0]?.trim() || null;
      } else {
        customerName = contract.companyName;
        attention = contract.contactPerson;
        customerAddress = contract.address;  // Use contract address for direct billing
        customerEmails = contract.emails || contract.email;  // Prefer emails
        customerEmail = customerEmails?.split(',')[0]?.trim() || null;  // First email for legacy
      }
    } else {
      customerName = contract.companyName;
      attention = contract.contactPerson;
      customerAddress = contract.address;  // Use contract address
      customerEmails = contract.emails || contract.email;  // Prefer emails
      customerEmail = customerEmails?.split(',')[0]?.trim() || null;  // First email for legacy
    }

    // Use product type label as default description if not provided
    if (!request.description) {
      const productTypes = await getProductTypes();
      const ptConfig = productTypes.find(t => t.value === contract.productType);
      description = ptConfig?.label || contract.productType.charAt(0) + contract.productType.slice(1).toLowerCase();
    }
  } else if (request.customBillTo) {
    // Custom billing details
    customerName = request.customBillTo.name;
    attention = request.customBillTo.attention || null;
    customerAddress = request.customBillTo.address || null;
    customerEmails = request.customBillTo.emails || request.customBillTo.email || null;  // Prefer emails
    customerEmail = customerEmails?.split(',')[0]?.trim() || null;  // First email for legacy
    customerTin = request.customBillTo.tin || null;
  } else {
    throw new Error('Invalid request: no source specified');
  }

  // Calculate billing amounts
  const isVatClient = (request.vatType ?? VatType.VAT) === VatType.VAT;
  const hasWithholding = request.hasWithholding ?? false;
  const withholdingRate = request.withholdingRate ?? 0.02;  // Default to 2%
  const withholdingCode = request.withholdingCode ?? 'WC160';  // Default code
  const vatRate = await getVatRate();  // Fetch configurable VAT rate

  // Prepare line items data
  let lineItemsToCreate: Array<{
    contractId?: string;
    date: Date;
    description: string;
    quantity: number;
    unitPrice: number;
    serviceFee: number;
    vatAmount: number;
    withholdingTax: number;
    amount: number;
    discountType?: string | null;
    discountValue?: number | null;
    discountAmount?: number | null;
  }> = [];

  // Calculate totals
  let totalServiceFee = 0;
  let totalVatAmount = 0;
  let totalWithholdingTax = 0;
  let totalNetAmount = 0;
  let totalGrossAmount = 0;

  let totalDiscountAmount = 0;

  if (request.lineItems && request.lineItems.length > 0) {
    // Multiple line items (multi-month billing)
    for (const item of request.lineItems) {
      const itemCalc = calculateBilling(
        item.amount,
        false, // VAT-exclusive (amount is net, VAT added on top)
        isVatClient,
        hasWithholding,
        withholdingRate,
        vatRate,
        item.discountType,
        item.discountValue
      );

      lineItemsToCreate.push({
        ...(contractId && { contractId }),
        date: new Date(),
        description: item.description,
        quantity: 1,
        unitPrice: itemCalc.serviceFee,
        serviceFee: itemCalc.serviceFee,
        vatAmount: itemCalc.vatAmount,
        withholdingTax: itemCalc.withholdingTax,
        amount: itemCalc.netAmount,
        discountType: itemCalc.discountAmount > 0 ? (item.discountType || null) : null,
        discountValue: itemCalc.discountAmount > 0 ? item.discountValue : null,
        discountAmount: itemCalc.discountAmount > 0 ? itemCalc.discountAmount : null,
      });

      totalServiceFee += itemCalc.serviceFee;
      totalDiscountAmount += itemCalc.discountAmount;
      totalVatAmount += itemCalc.vatAmount;
      totalWithholdingTax += itemCalc.withholdingTax;
      totalNetAmount += itemCalc.netAmount;
      totalGrossAmount += itemCalc.grossAmount;
    }
  } else {
    // Single line item
    const calculation = calculateBilling(
      request.billingAmount,
      false, // VAT-exclusive (amount is net, VAT added on top)
      isVatClient,
      hasWithholding,
      withholdingRate,
      vatRate
    );

    lineItemsToCreate.push({
      ...(contractId && { contractId }),
      date: new Date(),
      description,
      quantity: 1,
      unitPrice: calculation.serviceFee,
      serviceFee: calculation.serviceFee,
      vatAmount: calculation.vatAmount,
      withholdingTax: calculation.withholdingTax,
      amount: calculation.netAmount,
    });

    totalServiceFee = calculation.serviceFee;
    totalVatAmount = calculation.vatAmount;
    totalWithholdingTax = calculation.withholdingTax;
    totalNetAmount = calculation.netAmount;
    totalGrossAmount = calculation.grossAmount;
  }

  // Generate billing number
  const billingNo = generateBillingNo(
    billingEntity.invoicePrefix || 'INV',
    billingEntity.nextInvoiceNo
  );

  // Determine status
  const status = request.autoApprove ? InvoiceStatus.APPROVED : InvoiceStatus.PENDING;

  // Create the invoice
  const invoice = await prisma.invoice.create({
    data: {
      billingNo,
      companyId: request.billingEntityId,
      partnerId,
      productType: invoiceProductType,
      customerName,
      attention,
      customerAddress,
      customerEmail,
      customerEmails,
      customerTin,
      statementDate: new Date(),
      dueDate: request.dueDate,
      periodStart: request.periodStart,
      periodEnd: request.periodEnd,
      serviceFee: totalServiceFee,
      vatAmount: totalVatAmount,
      grossAmount: totalGrossAmount,
      withholdingTax: totalWithholdingTax,
      netAmount: totalNetAmount,
      discountAmount: totalDiscountAmount > 0 ? totalDiscountAmount : null,
      vatType: request.vatType ?? VatType.VAT,
      hasWithholding: hasWithholding,
      withholdingCode: hasWithholding ? withholdingCode : null,
      withholdingRate: hasWithholding ? withholdingRate : null,
      billingFrequency: BillingFrequency.MONTHLY,
      monthlyFee: request.billingAmount,
      status,
      approvedAt: request.autoApprove ? new Date() : null,
      billingModel,
      remarks: request.remarks,
      ...(contractId && {
        contracts: {
          connect: { id: contractId },
        },
      }),
      lineItems: {
        create: lineItemsToCreate,
      },
    },
    include: {
      lineItems: true,
      company: true,
    },
  });

  // Update company's next invoice number
  await prisma.company.update({
    where: { id: request.billingEntityId },
    data: {
      nextInvoiceNo: {
        increment: 1,
      },
    },
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      action: request.autoApprove ? 'INVOICE_AUTO_APPROVED' : 'INVOICE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      details: {
        billingNo,
        customerName,
        amount: totalNetAmount,
        source: request.scheduledBillingId ? 'scheduled' : request.contractId ? 'contract' : 'adhoc',
      },
    },
  });

  return {
    invoice: {
      id: invoice.id,
      billingNo: invoice.billingNo || invoice.id,
      status: invoice.status,
      netAmount: Number(invoice.netAmount),
      customerName: invoice.customerName,
    },
    autoApproved: request.autoApprove ?? false,
    scheduledBillingId: request.scheduledBillingId,
  };
}

/**
 * Generate an invoice from a scheduled billing
 */
export async function generateFromScheduledBilling(
  scheduledBillingId: string
): Promise<GenerateInvoiceResult> {
  const schedule = await getScheduledBilling(scheduledBillingId);

  if (!schedule) {
    throw new Error('Scheduled billing not found');
  }

  // Check if invoice already exists for this period
  const hasExisting = await checkExistingInvoiceForPeriod(scheduledBillingId);
  if (hasExisting) {
    throw new Error('Invoice already exists for this billing period');
  }

  // Calculate period based on frequency
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date;

  switch (schedule.frequency) {
    case BillingFrequency.MONTHLY:
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    case BillingFrequency.QUARTERLY:
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), quarter * 3, 1);
      periodEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      break;
    case BillingFrequency.ANNUALLY:
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = new Date(now.getFullYear(), 11, 31);
      break;
    case BillingFrequency.CUSTOM:
      // For custom intervals, calculate period based on interval from start date
      const baseDate = schedule.nextBillingDate ? new Date(schedule.nextBillingDate) : new Date(schedule.startDate);

      if (schedule.customIntervalUnit === 'DAYS' && schedule.customIntervalValue) {
        // Period ends on next billing date, starts interval days before
        periodEnd = new Date(baseDate);
        periodStart = new Date(baseDate);
        periodStart.setDate(periodStart.getDate() - schedule.customIntervalValue);
      } else if (schedule.customIntervalUnit === 'MONTHS' && schedule.customIntervalValue) {
        // Period ends on next billing date, starts interval months before
        periodEnd = new Date(baseDate);
        periodStart = new Date(baseDate);
        periodStart.setMonth(periodStart.getMonth() - schedule.customIntervalValue);
      } else {
        // Fallback to monthly if custom interval not properly configured
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }
      break;
  }

  // Calculate due date based on dueDayOfMonth
  // Due date is the dueDayOfMonth in the same month as the billing period
  const dueDayOfMonth = schedule.dueDayOfMonth || schedule.billingDayOfMonth;
  let dueDate = new Date(periodStart.getFullYear(), periodStart.getMonth(), dueDayOfMonth);

  // If due day is before billing day, due date is in the next month
  if (dueDayOfMonth < schedule.billingDayOfMonth) {
    dueDate = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, dueDayOfMonth);
  }

  // Format description with billing period (e.g., "Payroll Services - Jan 2026")
  let formattedDescription = schedule.description || 'Services';
  if (schedule.frequency === BillingFrequency.MONTHLY) {
    formattedDescription = `${formattedDescription} - ${format(periodStart, 'MMM yyyy')}`;
  } else if (schedule.frequency === BillingFrequency.QUARTERLY) {
    formattedDescription = `${formattedDescription} - Q${Math.floor(periodStart.getMonth() / 3) + 1} ${format(periodStart, 'yyyy')}`;
  } else if (schedule.frequency === BillingFrequency.ANNUALLY) {
    formattedDescription = `${formattedDescription} - ${format(periodStart, 'yyyy')}`;
  } else if (schedule.frequency === BillingFrequency.CUSTOM) {
    // For custom, show the period range
    formattedDescription = `${formattedDescription} - ${format(periodStart, 'MMM d')} to ${format(periodEnd, 'MMM d, yyyy')}`;
  }

  try {
    const result = await generateInvoice({
      contractId: schedule.contractId,
      scheduledBillingId: schedule.id,
      billingEntityId: schedule.billingEntityId,
      billingAmount: Number(schedule.billingAmount),
      vatType: schedule.vatType,
      hasWithholding: schedule.hasWithholding,
      withholdingRate: schedule.withholdingRate ? Number(schedule.withholdingRate) : undefined,
      dueDate,
      periodStart,
      periodEnd,
      autoApprove: schedule.autoApprove,
      description: formattedDescription,
      remarks: schedule.remarks || undefined,
    });

    // Record successful run
    await createScheduledBillingRun(
      scheduledBillingId,
      result.invoice.id,
      'SUCCESS'
    );

    // Update next billing date
    await updateNextBillingDate(scheduledBillingId);

    return result;
  } catch (error) {
    // Record failed run
    await createScheduledBillingRun(
      scheduledBillingId,
      null,
      'FAILED',
      error instanceof Error ? error.message : 'Unknown error'
    );

    throw error;
  }
}

/**
 * Generate multiple invoices at once (for batch operations)
 */
export async function generateInvoices(
  requests: GenerateInvoiceRequest[]
): Promise<GenerateInvoiceResult[]> {
  const results: GenerateInvoiceResult[] = [];

  for (const request of requests) {
    try {
      const result = await generateInvoice(request);
      results.push(result);
    } catch (error) {
      console.error('Failed to generate invoice:', error);
      // Continue with other invoices
    }
  }

  return results;
}
