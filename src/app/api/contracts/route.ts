import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { convexClient, api } from '@/lib/convex';
import { ProductType, ContractStatus, VatType, BillingType } from '@/lib/enums';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const billingEntity = searchParams.get('billingEntity');
    const productType = searchParams.get('productType');

    // Pagination params
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = (page - 1) * limit;

    // Get all contracts with optional status filter
    const allContracts = await convexClient.query(api.contracts.list, {
      ...(status ? { status } : {}),
    });

    // Apply additional filters client-side
    let filtered = allContracts;
    if (billingEntity) {
      filtered = filtered.filter((c: any) => c.billingEntity?.code === billingEntity);
    }
    if (productType) {
      filtered = filtered.filter((c: any) => c.productType === productType);
    }

    const total = filtered.length;

    // Sort by createdAt desc and paginate
    filtered.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    const contracts = filtered.slice(skip, skip + limit);

    return NextResponse.json({
      contracts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contracts' },
      { status: 500 }
    );
  }
}

// POST to create a new contract
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can create contracts
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();

    // Validate required fields (customerId is now optional - customerNumber is auto-generated)
    const requiredFields = ['companyName', 'productType', 'partner', 'billingEntity', 'monthlyFee'];
    const missingFields = requiredFields.filter(field => !body[field]);
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Find the partner
    const partner = await convexClient.query(api.partners.getByCode, {
      code: body.partner,
    });

    if (!partner) {
      return NextResponse.json(
        { error: `Partner not found: ${body.partner}` },
        { status: 400 }
      );
    }

    // Find the billing entity (company)
    const company = await convexClient.query(api.companies.getByCode, {
      code: body.billingEntity,
    });

    if (!company) {
      return NextResponse.json(
        { error: `Billing entity not found: ${body.billingEntity}` },
        { status: 400 }
      );
    }

    // Generate customer number (e.g., YOWI-0001, ABBA-0001)
    const prefix = company.contractPrefix || company.code;
    const nextNo = company.nextContractNo || 1;
    const customerNumber = `${prefix}-${String(nextNo).padStart(4, '0')}`;

    // Map productType to enum
    const productTypeMap: Record<string, ProductType> = {
      'ACCOUNTING': ProductType.ACCOUNTING,
      'PAYROLL': ProductType.PAYROLL,
      'COMPLIANCE': ProductType.COMPLIANCE,
      'HR': ProductType.HR,
    };

    const mappedProductType = productTypeMap[body.productType?.toUpperCase()] || ProductType.ACCOUNTING;

    // Map status to enum
    const statusMap: Record<string, ContractStatus> = {
      'ACTIVE': ContractStatus.ACTIVE,
      'INACTIVE': ContractStatus.INACTIVE,
      'STOPPED': ContractStatus.STOPPED,
      'NOT_STARTED': ContractStatus.NOT_STARTED,
    };

    const mappedStatus = statusMap[body.status?.toUpperCase()] || ContractStatus.ACTIVE;

    // Map vatType to enum
    const vatType = body.vatType?.toUpperCase() === 'NON_VAT' ? VatType.NON_VAT : VatType.VAT;

    // Map billingType to enum
    const billingType = body.billingType?.toUpperCase() === 'ONE_TIME' ? BillingType.ONE_TIME : BillingType.RECURRING;

    // Create the contract
    const contractId = await convexClient.mutation(api.contracts.create, {
      data: {
        customerNumber,
        customerId: body.customerId || null,
        companyName: body.companyName,
        productType: mappedProductType,
        partnerId: partner._id,
        billingEntityId: company._id,
        monthlyFee: body.monthlyFee,
        paymentPlan: body.paymentPlan || null,
        contractStart: body.contractStart ? new Date(body.contractStart).getTime() : null,
        nextDueDate: body.nextDueDate ? new Date(body.nextDueDate).getTime() : null,
        status: mappedStatus,
        vatType,
        billingType,
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        emails: body.emails || body.email || null,
        address: body.address || null,
        tin: body.tin || null,
        mobile: body.mobile || null,
        remarks: body.remarks || null,
        autoSendEnabled: body.autoSendEnabled ?? true,
        billingDayOfMonth: body.billingDayOfMonth || null,
        autoApprove: body.autoApprove ?? false,
      },
    });

    // Increment company's next contract number
    await convexClient.mutation(api.companies.incrementContractNo, {
      id: company._id,
    });

    // Get the created contract
    const contract = await convexClient.query(api.contracts.getById, { id: contractId });

    // Audit log
    await convexClient.mutation(api.auditLogs.create, {
      userId: session.user.id as any,
      action: 'CONTRACT_CREATED',
      entityType: 'Contract',
      entityId: contractId,
      details: {
        contractName: body.companyName,
        customerNumber,
      },
    });

    return NextResponse.json(contract, { status: 201 });
  } catch (error) {
    console.error('Error creating contract:', error);
    return NextResponse.json(
      { error: 'Failed to create contract' },
      { status: 500 }
    );
  }
}
