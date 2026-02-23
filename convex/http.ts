import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

/**
 * SHA-256 hash using Web Crypto API (Convex runtime compatible)
 */
async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate inbound bridge request via Bearer token
 */
async function validateBridgeRequest(
  request: Request
): Promise<{ valid: boolean; error?: string }> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { valid: false, error: "Missing or invalid Authorization header" };
  }

  const providedKey = authHeader.slice(7);
  const expectedHash = process.env.BRIDGE_API_KEY_HASH;

  if (!expectedHash) {
    return { valid: false, error: "BRIDGE_API_KEY_HASH not configured" };
  }

  const providedHash = await hashKey(providedKey);
  if (providedHash !== expectedHash) {
    return { valid: false, error: "Invalid API key" };
  }

  return { valid: true };
}

/**
 * CORS headers for bridge endpoints
 */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// ============================================================================
// Health Check
// ============================================================================

http.route({
  path: "/bridge/health",
  method: "POST",
  handler: httpAction(async () => {
    return new Response(
      JSON.stringify({ status: "ok", system: "billing-agent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }),
});

http.route({
  path: "/bridge/health",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }),
});

// ============================================================================
// Bridge Query Endpoint
// ============================================================================

http.route({
  path: "/bridge/query",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }),
});

http.route({
  path: "/bridge/query",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Auth check
    const auth = await validateBridgeRequest(request);
    if (!auth.valid) {
      return new Response(
        JSON.stringify({ error: auth.error }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    try {
      const body = await request.json();
      const { entity, searchTerm, contractId, status, nexusAgreementId } = body as {
        entity?: string;
        searchTerm?: string;
        contractId?: string;
        status?: string;
        nexusAgreementId?: string;
      };

      if (!entity) {
        return new Response(
          JSON.stringify({ error: "entity is required" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }

      const headers = { "Content-Type": "application/json", ...corsHeaders() };

      switch (entity) {
        case "contracts": {
          let contracts: any[] = await ctx.runQuery(api.contracts.list, {
            ...(status ? { status } : {}),
          });

          if (searchTerm) {
            const term = searchTerm.toLowerCase();
            contracts = contracts.filter((c: any) =>
              c.companyName?.toLowerCase().includes(term)
            );
          }
          if (nexusAgreementId) {
            const mapping = await ctx.runQuery(api.bridgeMappings.getByNexusAgreementId, {
              nexusAgreementId,
            });
            if (mapping) {
              contracts = contracts.filter((c: any) => c._id === mapping.contractId);
            } else {
              contracts = [];
            }
          }

          contracts = contracts.slice(0, 20);

          const contractsWithMappings = await Promise.all(
            contracts.map(async (c: any) => {
              const bridgeMapping = await ctx.runQuery(api.bridgeMappings.getByContractId, {
                contractId: c._id,
              });
              return {
                id: c._id,
                companyName: c.companyName,
                productType: c.productType,
                status: c.status,
                monthlyFee: Number(c.monthlyFee),
                billingAmount: c.billingAmount ? Number(c.billingAmount) : null,
                nextDueDate: c.nextDueDate,
                billingEntity: c.billingEntity?.code || null,
                email: c.email,
                contactPerson: c.contactPerson,
                nexusAgreementId: bridgeMapping?.nexusAgreementId || null,
              };
            })
          );

          return new Response(
            JSON.stringify({
              entity: "contracts",
              count: contractsWithMappings.length,
              data: contractsWithMappings,
            }),
            { status: 200, headers }
          );
        }

        case "invoices": {
          let invoices: any[] = await ctx.runQuery(api.invoices.list, {
            ...(status ? { status } : {}),
          });

          if (searchTerm) {
            const term = searchTerm.toLowerCase();
            invoices = invoices.filter((inv: any) =>
              inv.customerName?.toLowerCase().includes(term)
            );
          }
          if (contractId) {
            invoices = invoices.filter((inv: any) => inv.contractId === contractId);
          }

          invoices.sort((a: any, b: any) => (b.dueDate || 0) - (a.dueDate || 0));
          invoices = invoices.slice(0, 20);

          return new Response(
            JSON.stringify({
              entity: "invoices",
              count: invoices.length,
              data: invoices.map((inv: any) => ({
                id: inv._id,
                invoiceNo: inv.invoiceNo,
                billingNo: inv.billingNo,
                customerName: inv.customerName,
                status: inv.status,
                serviceFee: Number(inv.serviceFee),
                vatAmount: Number(inv.vatAmount),
                netAmount: Number(inv.netAmount),
                dueDate: inv.dueDate,
                paidAt: inv.paidAt,
                paidAmount: inv.paidAmount ? Number(inv.paidAmount) : null,
                billingEntity: inv.company?.code || null,
              })),
            }),
            { status: 200, headers }
          );
        }

        case "payments": {
          let payments: any[] = await ctx.runQuery(api.invoices.list, {
            status: "PAID",
          });

          if (searchTerm) {
            const term = searchTerm.toLowerCase();
            payments = payments.filter((inv: any) =>
              inv.customerName?.toLowerCase().includes(term)
            );
          }

          payments.sort((a: any, b: any) => (b.paidAt || 0) - (a.paidAt || 0));
          payments = payments.slice(0, 20);

          return new Response(
            JSON.stringify({
              entity: "payments",
              count: payments.length,
              data: payments.map((inv: any) => ({
                id: inv._id,
                invoiceNo: inv.invoiceNo,
                customerName: inv.customerName,
                netAmount: Number(inv.netAmount),
                paidAmount: inv.paidAmount ? Number(inv.paidAmount) : null,
                paidAt: inv.paidAt,
                paymentMethod: inv.paymentMethod,
                paymentReference: inv.paymentReference,
                billingEntity: inv.company?.code || null,
              })),
            }),
            { status: 200, headers }
          );
        }

        case "billing_summary": {
          const [totalContracts, activeContracts, totalInvoices, paidInvoices] =
            await Promise.all([
              ctx.runQuery(api.contracts.count, {}),
              ctx.runQuery(api.contracts.count, { status: "ACTIVE" }),
              ctx.runQuery(api.invoices.count, {}),
              ctx.runQuery(api.invoices.count, { status: "PAID" }),
            ]);

          const sentInvoices: any[] = await ctx.runQuery(api.invoices.list, {
            status: "SENT",
          });
          const now = Date.now();
          const overdueInvoices = sentInvoices.filter(
            (inv: any) => inv.dueDate && inv.dueDate < now
          ).length;

          return new Response(
            JSON.stringify({
              entity: "billing_summary",
              data: {
                totalContracts,
                activeContracts,
                totalInvoices,
                paidInvoices,
                overdueInvoices,
              },
            }),
            { status: 200, headers }
          );
        }

        case "users": {
          const users: any[] = await ctx.runQuery(api.users.list, {});

          return new Response(
            JSON.stringify({
              entity: "users",
              count: users.length,
              data: users.map((u: any) => ({
                id: u._id,
                name: u.name,
                email: u.email,
                role: u.role,
              })),
            }),
            { status: 200, headers }
          );
        }

        case "partners": {
          const partners: any[] = await ctx.runQuery(api.partners.list, {});

          if (searchTerm) {
            const term = searchTerm.toLowerCase();
            const filtered = partners.filter((p: any) =>
              p.name?.toLowerCase().includes(term) ||
              p.code?.toLowerCase().includes(term)
            );
            return new Response(
              JSON.stringify({
                entity: "partners",
                count: filtered.length,
                data: filtered.map((p: any) => ({
                  id: p._id,
                  code: p.code,
                  name: p.name,
                  email: p.email,
                  billingModel: p.billingModel,
                })),
              }),
              { status: 200, headers }
            );
          }

          return new Response(
            JSON.stringify({
              entity: "partners",
              count: partners.length,
              data: partners.map((p: any) => ({
                id: p._id,
                code: p.code,
                name: p.name,
                email: p.email,
                billingModel: p.billingModel,
              })),
            }),
            { status: 200, headers }
          );
        }

        default:
          return new Response(
            JSON.stringify({
              error: `Unknown entity: ${entity}. Supported: contracts, invoices, payments, billing_summary, users, partners`,
            }),
            { status: 400, headers }
          );
      }
    } catch (error) {
      console.error("Bridge query error:", error);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
  }),
});

export default http;
