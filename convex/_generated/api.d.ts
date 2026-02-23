/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as auditLogs from "../auditLogs.js";
import type * as bridgeMappings from "../bridgeMappings.js";
import type * as companies from "../companies.js";
import type * as contractInvoices from "../contractInvoices.js";
import type * as contracts from "../contracts.js";
import type * as emailLogs from "../emailLogs.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as followUpLogs from "../followUpLogs.js";
import type * as hitpayPaymentRequests from "../hitpayPaymentRequests.js";
import type * as http from "../http.js";
import type * as invoiceAttachments from "../invoiceAttachments.js";
import type * as invoiceLineItems from "../invoiceLineItems.js";
import type * as invoiceTemplates from "../invoiceTemplates.js";
import type * as invoices from "../invoices.js";
import type * as jobRuns from "../jobRuns.js";
import type * as notifications from "../notifications.js";
import type * as partners from "../partners.js";
import type * as rcbcEndClients from "../rcbcEndClients.js";
import type * as scheduledBillingRuns from "../scheduledBillingRuns.js";
import type * as scheduledBillings from "../scheduledBillings.js";
import type * as scheduledJobs from "../scheduledJobs.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as sessions from "../sessions.js";
import type * as settings from "../settings.js";
import type * as signatories from "../signatories.js";
import type * as systemConfig from "../systemConfig.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  auditLogs: typeof auditLogs;
  bridgeMappings: typeof bridgeMappings;
  companies: typeof companies;
  contractInvoices: typeof contractInvoices;
  contracts: typeof contracts;
  emailLogs: typeof emailLogs;
  emailTemplates: typeof emailTemplates;
  followUpLogs: typeof followUpLogs;
  hitpayPaymentRequests: typeof hitpayPaymentRequests;
  http: typeof http;
  invoiceAttachments: typeof invoiceAttachments;
  invoiceLineItems: typeof invoiceLineItems;
  invoiceTemplates: typeof invoiceTemplates;
  invoices: typeof invoices;
  jobRuns: typeof jobRuns;
  notifications: typeof notifications;
  partners: typeof partners;
  rcbcEndClients: typeof rcbcEndClients;
  scheduledBillingRuns: typeof scheduledBillingRuns;
  scheduledBillings: typeof scheduledBillings;
  scheduledJobs: typeof scheduledJobs;
  seed: typeof seed;
  seedData: typeof seedData;
  sessions: typeof sessions;
  settings: typeof settings;
  signatories: typeof signatories;
  systemConfig: typeof systemConfig;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
