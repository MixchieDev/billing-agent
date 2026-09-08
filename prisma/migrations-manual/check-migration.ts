import { PrismaClient } from '@/generated/prisma';
const need = {
  invoiceCols: ['createdById','reviewFlag','amountPaidTotal','balanceDue','wht2307Status',
    'wht2307ReceivedAt','followUpPausedUntil','suspensionNoticeAt','suspendedAt',
    'wht2307RequestCount','wht2307RequestedAt'],
  contractCols: ['renewalNoticeAt'],
  tables: ['CollectionRun','InvoicePayment','PdcCheck','PromiseToPay'],
  enums: ['PdcStatus','PtpStatus','ReviewFlag','Wht2307Status'],
  // Values added to EXISTING enums — easy to miss, since the type is present
  // either way. Checked as [type, value].
  enumValues: [['InvoiceStatus','PARTIALLY_PAID'], ['NotificationType','CONTRACT_RENEWAL']],
};
(async () => {
  const p = new PrismaClient();
  const q = (s: string) => p.$queryRawUnsafe<any[]>(s);
  const cols = (await q(`SELECT column_name c FROM information_schema.columns WHERE table_name='Invoice'`)).map(r=>r.c);
  const ccols = (await q(`SELECT column_name c FROM information_schema.columns WHERE table_name='Contract'`)).map(r=>r.c);
  const tabs = (await q(`SELECT table_name t FROM information_schema.tables WHERE table_schema='public'`)).map(r=>r.t);
  const enums = (await q(`SELECT typname e FROM pg_type WHERE typtype='e'`)).map(r=>r.e);
  const values = (await q(`SELECT t.typname||'.'||e.enumlabel v FROM pg_enum e
    JOIN pg_type t ON t.oid=e.enumtypid`)).map(r=>r.v);
  const miss = {
    columns: need.invoiceCols.filter(c => !cols.includes(c)),
    contractColumns: need.contractCols.filter(c => !ccols.includes(c)),
    tables: need.tables.filter(t => !tabs.includes(t)),
    enums: need.enums.filter(e => !enums.includes(e)),
    enumValues: need.enumValues.filter(([t, v]) => !values.includes(`${t}.${v}`)),
  };
  const ready = Object.values(miss).every(a => a.length === 0);
  console.log(ready ? 'READY — schema is fully migrated' : 'NOT READY');
  if (!ready) {
    if (miss.columns.length)         console.log('  missing Invoice columns :', miss.columns.join(', '));
    if (miss.contractColumns.length) console.log('  missing Contract columns:', miss.contractColumns.join(', '));
    if (miss.tables.length)          console.log('  missing tables          :', miss.tables.join(', '));
    if (miss.enums.length)           console.log('  missing enum types      :', miss.enums.join(', '));
    if (miss.enumValues.length)      console.log('  missing enum values     :', miss.enumValues.map(([t,v])=>`${t}.${v}`).join(', '));
  } else {
    const b = await q(`SELECT count(*)::int n, count("balanceDue")::int filled FROM "Invoice"`);
    console.log(`  backfill: ${b[0].filled}/${b[0].n} invoices have balanceDue set` +
      (b[0].filled < b[0].n ? '  <- run the backfill' : '  <- done'));
    const s = await q(`SELECT value FROM "Settings" WHERE key='collections.autoSendLevels'`);
    console.log(`  sweep: autoSendLevels = ${s.length ? JSON.stringify(s[0].value) : 'no row (defaults to dormant)'}`);
    const r = await q(`SELECT count(*)::int n, count("contractEndDate")::int dated
      FROM "Contract" WHERE status='ACTIVE'`);
    console.log(`  renewals: ${r[0].dated}/${r[0].n} active contracts have a renewal date` +
      (r[0].dated < r[0].n ? '  <- the rest can never be reminded' : ''));
  }
  await p.$disconnect();
})();
