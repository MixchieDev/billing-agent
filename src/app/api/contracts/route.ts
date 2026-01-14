import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ProductType, ContractStatus, VatType, BillingType } from '@/generated/prisma';

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

    const contracts = await prisma.contract.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(billingEntity && { billingEntity: { code: billingEntity } }),
        ...(productType && { productType: productType as any }),
      },
      include: {
        billingEntity: true,
        partner: true,
      },
      orderBy: { nextDueDate: 'asc' },
    });

    return NextResponse.json(contracts);
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

    // Validate required fields
    const requiredFields = ['customerId', 'companyName', 'productType', 'partner', 'billingEntity', 'monthlyFee'];
    const missingFields = requiredFields.filter(field => !body[field]);
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      );
    }

    // Find the partner
    const partner = await prisma.partner.findUnique({
      where: { code: body.partner },
    });

    if (!partner) {
      return NextResponse.json(
        { error: `Partner not found: ${body.partner}` },
        { status: 400 }
      );
    }

    // Find the billing entity (company)
    const company = await prisma.company.findUnique({
      where: { code: body.billingEntity },
    });

    if (!company) {
      return NextResponse.json(
        { error: `Billing entity not found: ${body.billingEntity}` },
        { status: 400 }
      );
    }

    // Check if contract with this customerId already exists
    const existingContract = await prisma.contract.findFirst({
      where: {
        customerId: body.customerId,
        billingEntityId: company.id,
      },
    });

    if (existingContract) {
      return NextResponse.json(
        { error: `Contract with customerId ${body.customerId} already exists` },
        { status: 409 }
      );
    }

    // Map productType to enum
    const productTypeMap: Record<string, ProductType> = {
      'ACCOUNTING': ProductType.ACCOUNTING,
      'PAYROLL': ProductType.PAYROLL,
      'COMPLIANCE': ProductType.COMPLIANCE,
      'HR': ProductType.HR,
    };

    const productType = productTypeMap[body.productType?.toUpperCase()] || ProductType.ACCOUNTING;

    // Map status to enum
    const statusMap: Record<string, ContractStatus> = {
      'ACTIVE': ContractStatus.ACTIVE,
      'INACTIVE': ContractStatus.INACTIVE,
      'STOPPED': ContractStatus.STOPPED,
      'NOT_STARTED': ContractStatus.NOT_STARTED,
    };

    const status = statusMap[body.status?.toUpperCase()] || ContractStatus.ACTIVE;

    // Map vatType to enum
    const vatType = body.vatType?.toUpperCase() === 'NON_VAT' ? VatType.NON_VAT : VatType.VAT;

    // Map billingType to enum
    const billingType = body.billingType?.toUpperCase() === 'ONE_TIME' ? BillingType.ONE_TIME : BillingType.RECURRING;

    // Create the contract
    const contract = await prisma.contract.create({
      data: {
        customerId: body.customerId,
        companyName: body.companyName,
        productType,
        partnerId: partner.id,
        billingEntityId: company.id,
        monthlyFee: body.monthlyFee,
        paymentPlan: body.paymentPlan || null,
        contractStart: body.contractStart ? new Date(body.contractStart) : null,
        nextDueDate: body.nextDueDate ? new Date(body.nextDueDate) : null,
        status,
        vatType,
        billingType,
        contactPerson: body.contactPerson || null,
        email: body.email || null,
        emails: body.emails || body.email || null,  // Support both, prefer emails
        address: body.address || null,
        tin: body.tin || null,
        mobile: body.mobile || null,
        remarks: body.remarks || null,
        autoSendEnabled: body.autoSendEnabled ?? true,
        billingDayOfMonth: body.billingDayOfMonth || null,
        autoApprove: body.autoApprove ?? false,
      },
      include: {
        billingEntity: true,
        partner: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONTRACT_CREATED',
        entityType: 'Contract',
        entityId: contract.id,
        details: {
          contractName: contract.companyName,
          customerId: contract.customerId,
        },
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
