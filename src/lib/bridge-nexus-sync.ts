import prisma from '@/lib/prisma';
import { getNexusBridgeHeaders, getNexusConvexUrl } from '@/lib/bridge-auth';

/**
 * Notify Nexus that an invoice has been paid.
 * Fire-and-forget — logs errors but does not throw.
 */
export async function notifyNexusPayment(invoiceId: string): Promise<void> {
  try {
    // Find the invoice with its contract and bridge mapping
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNo: true,
        billingNo: true,
        paidAmount: true,
        paidAt: true,
        paymentMethod: true,
        paymentReference: true,
        netAmount: true,
        contracts: {
          select: {
            id: true,
            bridgeMappings: {
              select: {
                nexusAgreementId: true,
                nexusOrganizationId: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      console.log(`Bridge: Invoice ${invoiceId} not found, skipping Nexus notification`);
      return;
    }

    // Find a bridge mapping from any linked contract
    let nexusAgreementId: string | undefined;
    let nexusOrganizationId: string | undefined;

    for (const contract of invoice.contracts) {
      if (contract.bridgeMappings.length > 0) {
        nexusAgreementId = contract.bridgeMappings[0].nexusAgreementId;
        nexusOrganizationId = contract.bridgeMappings[0].nexusOrganizationId;
        break;
      }
    }

    if (!nexusAgreementId) {
      console.log(
        `Bridge: No Nexus mapping found for invoice ${invoiceId}, skipping payment notification`
      );
      return;
    }

    const payload = {
      nexusAgreementId,
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo || invoice.billingNo,
      paidAmount: Number(invoice.paidAmount || invoice.netAmount),
      paymentMethod: invoice.paymentMethod || 'unknown',
      paymentReference: invoice.paymentReference,
      paidAt: invoice.paidAt?.toISOString() || new Date().toISOString(),
      currency: 'PHP',
    };

    const response = await fetch(getNexusConvexUrl('/bridge/billing/payment'), {
      method: 'POST',
      headers: getNexusBridgeHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Bridge: Nexus payment sync failed for invoice ${invoiceId}: ${response.status} ${errorText}`
      );
    } else {
      console.log(`Bridge: Payment notification sent to Nexus for invoice ${invoiceId}`);
    }
  } catch (error) {
    console.error(
      'Bridge: Error notifying Nexus of payment:',
      error instanceof Error ? error.message : error
    );
  }
}
