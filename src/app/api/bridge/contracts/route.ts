import { NextRequest, NextResponse } from 'next/server';
import { convexClient, api } from '@/lib/convex';
import { validateBridgeApiKey } from '@/lib/bridge-auth';
import { ContractStatus, VatType, BillingType, BillingFrequency, ScheduleStatus } from '@/lib/enums';

interface BridgeContractPayload {
  nexusAgreementId: string;
  nexusOrganizationId: string;
  agreementNumber: string;
  companyName: string;
  contactPerson?: string;
  email?: string;
  mobile?: string;
  address?: string;
  tin?: string;
  industry?: string;
  // Financial
  totalAmount: number;
  currency: string;
  // Product / billing
  productType: string;
  billingType?: string;
  billingFrequency?: string;
  vatType?: string;
  // Dates
  startDate?: string;
  endDate?: string;
  // Billing entity & partner lookup codes
  billingEntityCode: string;
  partnerCode?: string;
  // Scheduled billing
  billingDayOfMonth?: number;
  description?: string;
  remarks?: string;
}

const PRODUCT_TYPE_MAP: Record<string, string> = {
  accounting: 'ACCOUNTING',
  payroll: 'PAYROLL',
  compliance: 'COMPLIANCE',
  hr: 'HR',
  ACCOUNTING: 'ACCOUNTING',
  PAYROLL: 'PAYROLL',
  COMPLIANCE: 'COMPLIANCE',
  HR: 'HR',
};

/**
 * POST /api/bridge/contracts
 * Creates a Contract + ScheduledBilling from a signed Nexus agreement.
 */
export async function POST(request: NextRequest) {
  if (!validateBridgeApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: BridgeContractPayload = await request.json();

    // Validate required fields
    if (!body.nexusAgreementId || !body.billingEntityCode || !body.companyName || !body.totalAmount) {
      return NextResponse.json(
        { error: 'Missing required fields: nexusAgreementId, billingEntityCode, companyName, totalAmount' },
        { status: 400 }
      );
    }

    // Idempotency: check if this agreement was already synced
    const existingMapping = await convexClient.query(api.bridgeMappings.getByNexusAgreementId, {
      nexusAgreementId: body.nexusAgreementId,
    });

    if (existingMapping) {
      const contract = await convexClient.query(api.contracts.getById, {
        id: existingMapping.contractId,
      });
      return NextResponse.json({
        action: 'already_exists',
        contractId: existingMapping.contractId,
        customerNumber: contract?.customerNumber,
      });
    }

    // Look up billing entity (Company) by code
    const billingEntity = await convexClient.query(api.companies.getByCode, {
      code: body.billingEntityCode,
    });

    if (!billingEntity) {
      return NextResponse.json(
        { error: `Billing entity not found for code: ${body.billingEntityCode}` },
        { status: 404 }
      );
    }

    // Look up partner by code (optional)
    let partnerId: string | null = null;
    if (body.partnerCode) {
      const partner = await convexClient.query(api.partners.getByCode, {
        code: body.partnerCode,
      });
      if (partner) {
        partnerId = partner._id;
      }
    }

    // Map product type
    const productType = PRODUCT_TYPE_MAP[body.productType] || 'ACCOUNTING';

    // Map VAT type
    const vatType: VatType = body.vatType?.toUpperCase() === 'NON_VAT' ? 'NON_VAT' : 'VAT';
    const vatRate = vatType === 'VAT' ? 0.12 : 0;
    const monthlyFee = body.totalAmount;
    const vatAmount = monthlyFee * vatRate;
    const totalWithVat = monthlyFee + vatAmount;

    // Determine billing frequency
    const billingFrequency: BillingFrequency =
      (body.billingFrequency?.toUpperCase() as BillingFrequency) || 'MONTHLY';

    const billingDayOfMonth = body.billingDayOfMonth || 1;
    const contractStartMs = body.startDate ? new Date(body.startDate).getTime() : Date.now();
    const contractEndMs = body.endDate ? new Date(body.endDate).getTime() : null;

    // Auto-generate customerNumber
    const prefix = billingEntity.contractPrefix || billingEntity.code;
    const seqNo = billingEntity.nextContractNo || 1;
    const customerNumber = `${prefix}-${String(seqNo).padStart(5, '0')}`;

    // Increment nextContractNo
    await convexClient.mutation(api.companies.incrementContractNo, {
      id: billingEntity._id,
    });

    // Create Contract
    const contractId = await convexClient.mutation(api.contracts.create, {
      data: {
        customerNumber,
        companyName: body.companyName,
        productType: productType as any,
        billingType: (body.billingType?.toUpperCase() as BillingType) || 'RECURRING',
        billingEntityId: billingEntity._id,
        partnerId,
        monthlyFee,
        vatType,
        vatAmount,
        totalWithVat,
        netReceivable: totalWithVat,
        billingAmount: monthlyFee,
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        mobile: body.mobile || null,
        address: body.address || null,
        tin: body.tin || null,
        industry: body.industry || null,
        contractStart: contractStartMs,
        contractEndDate: contractEndMs,
        billingDayOfMonth,
        status: 'ACTIVE' as ContractStatus,
        remarks: body.remarks || `Auto-created from Nexus agreement ${body.agreementNumber}`,
      },
    });

    // Create ScheduledBilling
    // Calculate first billing date
    const now = Date.now();
    const contractStartDate = new Date(contractStartMs);
    let nextBillingDate = new Date(contractStartDate);
    nextBillingDate.setDate(billingDayOfMonth);
    if (nextBillingDate.getTime() <= now) {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }

    await convexClient.mutation(api.scheduledBillings.create, {
      data: {
        contractId,
        billingEntityId: billingEntity._id,
        billingAmount: monthlyFee,
        vatType,
        frequency: billingFrequency,
        billingDayOfMonth,
        startDate: contractStartMs,
        endDate: contractEndMs,
        nextBillingDate: nextBillingDate.getTime(),
        status: 'ACTIVE' as ScheduleStatus,
        autoApprove: false,
        autoSendEnabled: true,
        description: body.description || `${body.companyName} - ${productType}`,
      },
    });

    // Create BridgeMapping
    await convexClient.mutation(api.bridgeMappings.create, {
      nexusAgreementId: body.nexusAgreementId,
      nexusOrganizationId: body.nexusOrganizationId,
      contractId,
      syncStatus: 'success',
    });

    return NextResponse.json({
      action: 'created',
      contractId,
      customerNumber,
    });
  } catch (error) {
    console.error('Bridge: Contract creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
