/**
 * Seed the STAGING database with a login + demo data so you can click through
 * the collections features in a browser. Safe to re-run (resets the DEMO-* set).
 * Dates are relative to "now", so a re-run always repopulates every aging
 * bucket, the this-week stats, and the 14-day cash calendar.
 *
 *   set -a && . ./.env.staging && set +a && \
 *   DATABASE_URL="$STAGING_DATABASE_URL" npx tsx prisma/seed-staging.ts
 */
import { PrismaClient, Prisma } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const D = (n: number) => new Prisma.Decimal(n);
const days = (n: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
};

const LOGIN = { email: 'admin@staging.test', password: 'staging1234' };

async function main() {
  // Admin login
  const password = await bcrypt.hash(LOGIN.password, 12);
  const admin = await prisma.user.upsert({
    where: { email: LOGIN.email },
    update: { password, role: 'ADMIN' },
    create: { email: LOGIN.email, name: 'Staging Admin', role: 'ADMIN', password },
  });

  // Billing entities
  const yowi = await prisma.company.upsert({
    where: { code: 'YOWI' }, update: {},
    create: { code: 'YOWI', name: 'YOWI Inc.', invoicePrefix: 'S', nextInvoiceNo: 1 },
  });
  const abba = await prisma.company.upsert({
    where: { code: 'ABBA' }, update: {},
    create: { code: 'ABBA', name: 'ABBA Corp.', invoicePrefix: 'A', nextInvoiceNo: 1 },
  });

  // Reset the demo set (payments/promises/follow-ups cascade with invoices).
  await prisma.invoice.deleteMany({ where: { billingNo: { startsWith: 'DEMO-' } } });
  await prisma.pdcCheck.deleteMany({ where: { bankName: 'Demo Bank' } });

  const mk = (
    billingNo: string,
    companyId: string,
    customerName: string,
    status: 'SENT' | 'PENDING' | 'PARTIALLY_PAID' | 'PAID',
    serviceFee: number,
    wht: number,
    dueInDays: number
  ) => {
    const vat = Math.round(serviceFee * 0.12 * 100) / 100;
    const gross = serviceFee + vat;
    const net = gross - wht;
    return {
      billingNo, companyId, customerName, status,
      statementDate: days(dueInDays - 30), dueDate: days(dueInDays),
      serviceFee: D(serviceFee), vatAmount: D(vat), grossAmount: D(gross),
      withholdingTax: D(wht), netAmount: D(net),
      amountPaidTotal: D(0), balanceDue: D(net),
      productType: 'ACCOUNTING',
      customerEmail: `ap@${customerName.toLowerCase().replace(/[^a-z]/g, '')}.test`,
    };
  };

  // ---- Outstanding invoices covering every aging bucket ----
  await prisma.invoice.createMany({
    data: [
      // Current (not yet due) — these also appear as DUEs on the cash calendar
      { ...mk('DEMO-0001', yowi.id, 'Acme Corp', 'SENT', 25000, 0, 5), id: 'demo-cur-1' },
      { ...mk('DEMO-0002', abba.id, 'Beta Industries', 'SENT', 18000, 560, 12), id: 'demo-cur-2' },
      // 1–30 days overdue
      { ...mk('DEMO-0003', yowi.id, 'Gamma Trading', 'SENT', 32000, 0, -10), id: 'demo-1-30' },
      // 31–60 days overdue (will carry an OPEN promise → paused)
      { ...mk('DEMO-0004', abba.id, 'Delta Logistics', 'SENT', 45000, 1008, -45), id: 'demo-31-60' },
      // 61–90 days overdue (broken promise + a warehoused PDC)
      { ...mk('DEMO-0005', yowi.id, 'Epsilon Foods', 'SENT', 27000, 0, -75), id: 'demo-61-90' },
      // 90+ days overdue — the problem account
      { ...mk('DEMO-0006', abba.id, 'Zeta Mining', 'SENT', 80000, 1792, -120), id: 'demo-90plus' },
      // Partially paid, 20 days overdue — shows balance-based aging
      { ...mk('DEMO-0007', yowi.id, 'Eta Retail', 'PARTIALLY_PAID', 40000, 0, -20), id: 'demo-partial' },
      // Fully paid this week — feeds "Collected This Week" only
      { ...mk('DEMO-0008', abba.id, 'Theta Studios', 'PAID', 15000, 0, -8), id: 'demo-paid' },
      // Pending approval — for the approval flow, not collections
      { ...mk('DEMO-0009', yowi.id, 'Iota Labs', 'PENDING', 5000, 0, 20), id: 'demo-pending' },
    ],
  });

  // Partial payment state for DEMO-0007: 15,000 of 44,800 paid two days ago.
  await prisma.invoice.update({
    where: { id: 'demo-partial' },
    data: { amountPaidTotal: D(15000), balanceDue: D(29800) },
  });
  // Settle DEMO-0008 (paid yesterday).
  await prisma.invoice.update({
    where: { id: 'demo-paid' },
    data: { amountPaidTotal: D(16800), balanceDue: D(0), paidAt: days(-1), paidAmount: D(16800), paymentMethod: 'BANK_TRANSFER' },
  });

  // ---- Payments this week (feed "Collected This Week") ----
  await prisma.invoicePayment.createMany({
    data: [
      { invoiceId: 'demo-partial', amount: D(15000), method: 'BANK_TRANSFER', paidDate: days(0), reference: 'DEMO-PAY-1' },
      { invoiceId: 'demo-paid', amount: D(16800), method: 'BANK_TRANSFER', paidDate: days(-1), reference: 'DEMO-PAY-2' },
    ],
  });

  // ---- Promises: one OPEN (pauses DEMO-0004), one BROKEN (DEMO-0005) ----
  await prisma.promiseToPay.createMany({
    data: [
      { invoiceId: 'demo-31-60', promisedDate: days(6), promisedAmount: D(51408), madeBy: 'Dina (AP head)', capturedBy: admin.id, channel: 'CALL', status: 'OPEN', notes: 'Will settle after their board meeting' },
      { invoiceId: 'demo-61-90', promisedDate: days(-5), promisedAmount: D(27000), madeBy: 'Erwin', capturedBy: admin.id, channel: 'EMAIL', status: 'BROKEN', notes: 'Missed the promised date' },
    ],
  });
  await prisma.invoice.update({ where: { id: 'demo-31-60' }, data: { followUpPausedUntil: days(6) } });

  // ---- Follow-ups sent this week ----
  await prisma.followUpLog.createMany({
    data: [
      { invoiceId: 'demo-1-30', level: 1, sentAt: days(-1), toEmail: 'ap@gammatrading.test', subject: 'Gentle reminder: DEMO-0003', status: 'SENT' },
      { invoiceId: 'demo-90plus', level: 3, sentAt: days(0), toEmail: 'finance@zetamining.test', subject: 'Final notice: DEMO-0006', status: 'SENT' },
    ],
  });
  await prisma.invoice.update({ where: { id: 'demo-1-30' }, data: { followUpCount: 1, lastFollowUpLevel: 1, lastFollowUpAt: days(-1) } });
  await prisma.invoice.update({ where: { id: 'demo-90plus' }, data: { followUpCount: 3, lastFollowUpLevel: 3, lastFollowUpAt: days(0) } });

  // ---- PDC register: two checks inside the 14-day calendar window ----
  await prisma.pdcCheck.createMany({
    data: [
      { invoiceId: 'demo-61-90', checkNo: '001234', bankName: 'Demo Bank', amount: D(27000), checkDate: days(7), status: 'WAREHOUSED', location: 'Office safe' },
      { checkNo: '005678', bankName: 'Demo Bank', amount: D(12500), checkDate: days(3), status: 'DEPOSITED', depositedAt: days(-1) },
    ],
  });

  // ---- 2307 certificates owed to us (paid invoices where the client withheld) ----
  // One recent, one long-overdue, plus an "unbilled withholding" case where the
  // certificate value sits in the residual balance rather than withholdingTax.
  await prisma.invoice.createMany({
    data: [
      { ...mk('DEMO-0010', abba.id, 'Kappa Freight', 'PAID', 60000, 1200, -25), id: 'demo-2307-a' },
      { ...mk('DEMO-0011', yowi.id, 'Lambda Metals', 'PAID', 90000, 1800, -140), id: 'demo-2307-b' },
      { ...mk('DEMO-0012', abba.id, 'Mu Textiles', 'PAID', 30000, 0, -70), id: 'demo-2307-c' },
    ],
  });
  // Billed-withholding cases: settled in cash, certificate still owed.
  await prisma.invoice.updateMany({
    where: { id: { in: ['demo-2307-a', 'demo-2307-b'] } },
    data: { wht2307Status: 'PENDING', balanceDue: D(0) },
  });
  // Cash received = gross − withheld, so the reconciliation in the 2307 request
  // email ties out exactly (67,200 − 1,200 and 100,800 − 1,800).
  await prisma.invoice.update({
    where: { id: 'demo-2307-a' },
    data: { amountPaidTotal: D(66000), paidAt: days(-20), paidAmount: D(66000), paymentMethod: 'BANK_TRANSFER' },
  });
  await prisma.invoice.update({
    where: { id: 'demo-2307-b' },
    data: { amountPaidTotal: D(99000), paidAt: days(-135), paidAmount: D(99000), paymentMethod: 'BANK_TRANSFER' },
  });
  // Unbilled withholding: client deducted 672 that wasn't billed — the residual
  // balance IS the certificate value.
  await prisma.invoice.update({
    where: { id: 'demo-2307-c' },
    data: {
      wht2307Status: 'PENDING', paidAt: days(-65), paymentMethod: 'BANK_TRANSFER',
      amountPaidTotal: D(32928), paidAmount: D(32928), balanceDue: D(672),
    },
  });
  await prisma.invoicePayment.createMany({
    data: [
      { invoiceId: 'demo-2307-a', amount: D(66000), method: 'BANK_TRANSFER', paidDate: days(-20), reference: 'DEMO-2307-A' },
      { invoiceId: 'demo-2307-b', amount: D(99000), method: 'BANK_TRANSFER', paidDate: days(-135), reference: 'DEMO-2307-B' },
      { invoiceId: 'demo-2307-c', amount: D(32928), method: 'BANK_TRANSFER', paidDate: days(-65), reference: 'DEMO-2307-C', isEwtShort: true },
    ],
  });

  // ---- Ladder config: L1 auto-sends, L2/L3 draft-for-review (the brief's
  // recommended first-month setup) so the queue shows both modes ----
  await prisma.settings.upsert({
    where: { key: 'collections.autoSendLevels' },
    update: { value: [1] },
    create: { key: 'collections.autoSendLevels', value: [1], category: 'collections',
      description: 'Follow-up levels the nightly sweep may send without review' },
  });

  console.log('[seed-staging] done.');
  console.log(`[seed-staging] login: ${LOGIN.email}  /  ${LOGIN.password}`);
  console.log('[seed-staging] 9 invoices across all aging buckets + partial + paid-this-week');
  console.log('[seed-staging] 1 open promise (pauses DEMO-0004), 1 broken; 2 follow-ups this week; 2 PDC checks');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
