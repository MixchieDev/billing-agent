import { convexClient, api } from '@/lib/convex';
import { getNexusBridgeHeaders, getNexusConvexUrl } from '@/lib/bridge-auth';

/**
 * Notify Nexus that an invoice has been paid.
 * Fire-and-forget — logs errors but does not throw.
 */
export async function notifyNexusPayment(invoiceId: string): Promise<void> {
  try {
    // Find the invoice with its contracts and bridge mappings
    const invoice = await convexClient.query(api.invoices.getByIdFull, { id: invoiceId as any });

    if (!invoice) {
      console.log(`Bridge: Invoice ${invoiceId} not found, skipping Nexus notification`);
      return;
    }

    // Find a bridge mapping from any linked contract
    let nexusAgreementId: string | undefined;
    let nexusOrganizationId: string | undefined;

    if (invoice.contracts && Array.isArray(invoice.contracts)) {
      for (const contract of invoice.contracts) {
        if (!contract) continue;
        const mapping = await convexClient.query(api.bridgeMappings.getByContractId, {
          contractId: contract._id,
        });
        if (mapping) {
          nexusAgreementId = mapping.nexusAgreementId;
          nexusOrganizationId = mapping.nexusOrganizationId;
          break;
        }
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
      invoiceId: invoice._id,
      invoiceNo: invoice.invoiceNo || invoice.billingNo,
      paidAmount: Number(invoice.paidAmount || invoice.netAmount),
      paymentMethod: invoice.paymentMethod || 'unknown',
      paymentReference: invoice.paymentReference,
      paidAt: invoice.paidAt ? new Date(invoice.paidAt).toISOString() : new Date().toISOString(),
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
