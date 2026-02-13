import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ContractStatus, VatType, BillingType } from '@/generated/prisma';

// GET single contract
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        billingEntity: true,
        partner: true,
      },
    });

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error fetching contract:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contract' },
      { status: 500 }
    );
  }
}

// PATCH to update contract settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update contract settings
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Check if contract exists
    const existingContract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!existingContract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Validate and extract allowed fields
    const updateData: {
      autoSendEnabled?: boolean;
      contractEndDate?: Date | null;
      billingDayOfMonth?: number | null;
      autoApprove?: boolean;
    } = {};

    if (typeof body.autoSendEnabled === 'boolean') {
      updateData.autoSendEnabled = body.autoSendEnabled;
    }

    if (body.contractEndDate !== undefined) {
      updateData.contractEndDate = body.contractEndDate ? new Date(body.contractEndDate) : null;
    }

    if (body.billingDayOfMonth !== undefined) {
      updateData.billingDayOfMonth = body.billingDayOfMonth || null;
    }

    if (typeof body.autoApprove === 'boolean') {
      updateData.autoApprove = body.autoApprove;
    }

    // Only update if there are valid fields
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const contract = await prisma.contract.update({
      where: { id },
      data: updateData,
      include: {
        billingEntity: true,
        partner: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONTRACT_SETTINGS_UPDATED',
        entityType: 'Contract',
        entityId: id,
        details: {
          contractName: contract.companyName,
          changes: updateData,
        },
      },
    });

    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error updating contract:', error);
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    );
  }
}

// PUT to fully update a contract
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can update contracts
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    // Check if contract exists
    const existingContract = await prisma.contract.findUnique({
      where: { id },
    });

    if (!existingContract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Find the partner if provided
    let partnerId = existingContract.partnerId;
    if (body.partner) {
      const partner = await prisma.partner.findUnique({
        where: { code: body.partner },
      });
      if (!partner) {
        return NextResponse.json(
          { error: `Partner not found: ${body.partner}` },
          { status: 400 }
        );
      }
      partnerId = partner.id;
    }

    // Find the billing entity if provided
    let billingEntityId = existingContract.billingEntityId;
    if (body.billingEntity) {
      const company = await prisma.company.findUnique({
        where: { code: body.billingEntity },
      });
      if (!company) {
        return NextResponse.json(
          { error: `Billing entity not found: ${body.billingEntity}` },
          { status: 400 }
        );
      }
      billingEntityId = company.id;
    }

    // Map status to enum
    const statusMap: Record<string, ContractStatus> = {
      'ACTIVE': ContractStatus.ACTIVE,
      'INACTIVE': ContractStatus.INACTIVE,
      'STOPPED': ContractStatus.STOPPED,
      'NOT_STARTED': ContractStatus.NOT_STARTED,
    };

    // Build update data
    const updateData: Record<string, any> = {
      partnerId,
      billingEntityId,
    };

    // Only update fields that are provided
    if (body.customerId !== undefined) updateData.customerId = body.customerId;
    if (body.companyName !== undefined) updateData.companyName = body.companyName;
    if (body.productType !== undefined) {
      updateData.productType = body.productType?.toUpperCase() || existingContract.productType;
    }
    if (body.monthlyFee !== undefined) updateData.monthlyFee = body.monthlyFee;
    if (body.paymentPlan !== undefined) updateData.paymentPlan = body.paymentPlan || null;
    if (body.contractStart !== undefined) {
      updateData.contractStart = body.contractStart ? new Date(body.contractStart) : null;
    }
    if (body.nextDueDate !== undefined) {
      updateData.nextDueDate = body.nextDueDate ? new Date(body.nextDueDate) : null;
    }
    if (body.status !== undefined) {
      updateData.status = statusMap[body.status?.toUpperCase()] || existingContract.status;
    }
    if (body.vatType !== undefined) {
      updateData.vatType = body.vatType?.toUpperCase() === 'NON_VAT' ? VatType.NON_VAT : VatType.VAT;
    }
    if (body.billingType !== undefined) {
      updateData.billingType = body.billingType?.toUpperCase() === 'ONE_TIME' ? BillingType.ONE_TIME : BillingType.RECURRING;
    }
    if (body.contactPerson !== undefined) updateData.contactPerson = body.contactPerson || null;
    if (body.email !== undefined) updateData.email = body.email || null;
    if (body.emails !== undefined) updateData.emails = body.emails || null;
    if (body.address !== undefined) updateData.address = body.address || null;
    if (body.tin !== undefined) updateData.tin = body.tin || null;
    if (body.mobile !== undefined) updateData.mobile = body.mobile || null;
    if (body.remarks !== undefined) updateData.remarks = body.remarks || null;
    if (typeof body.autoSendEnabled === 'boolean') updateData.autoSendEnabled = body.autoSendEnabled;
    if (body.contractEndDate !== undefined) {
      updateData.contractEndDate = body.contractEndDate ? new Date(body.contractEndDate) : null;
    }
    if (body.billingDayOfMonth !== undefined) {
      updateData.billingDayOfMonth = body.billingDayOfMonth || null;
    }
    if (typeof body.autoApprove === 'boolean') {
      updateData.autoApprove = body.autoApprove;
    }

    const contract = await prisma.contract.update({
      where: { id },
      data: updateData,
      include: {
        billingEntity: true,
        partner: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONTRACT_UPDATED',
        entityType: 'Contract',
        entityId: id,
        details: {
          contractName: contract.companyName,
          changes: Object.keys(updateData),
        },
      },
    });

    return NextResponse.json(contract);
  } catch (error) {
    console.error('Error updating contract:', error);
    return NextResponse.json(
      { error: 'Failed to update contract' },
      { status: 500 }
    );
  }
}

// DELETE a contract
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only admins can delete contracts
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Check if contract exists
    const existingContract = await prisma.contract.findUnique({
      where: { id },
      include: { invoices: { take: 1 } },
    });

    if (!existingContract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 });
    }

    // Prevent deletion if contract has invoices
    if (existingContract.invoices.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete contract with existing invoices. Consider marking it as STOPPED instead.' },
        { status: 400 }
      );
    }

    // Delete the contract
    await prisma.contract.delete({
      where: { id },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CONTRACT_DELETED',
        entityType: 'Contract',
        entityId: id,
        details: {
          contractName: existingContract.companyName,
          customerId: existingContract.customerId,
        },
      },
    });

    return NextResponse.json({ success: true, message: 'Contract deleted successfully' });
  } catch (error) {
    console.error('Error deleting contract:', error);
    return NextResponse.json(
      { error: 'Failed to delete contract' },
      { status: 500 }
    );
  }
}
