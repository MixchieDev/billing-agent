import { PrismaClient } from '@/generated/prisma';
const need = {
  cols: ['createdById','reviewFlag','amountPaidTotal','balanceDue','wht2307Status',
    'wht2307ReceivedAt','followUpPausedUntil','suspensionNoticeAt','suspendedAt',
    'wht2307RequestCount','wht2307RequestedAt'],
  tables: ['CollectionRun','InvoicePayment','PdcCheck','PromiseToPay'],
  enums: ['PdcStatus','PtpStatus','ReviewFlag','Wht2307Status'],
};
(async () => {
  const p = new PrismaClient();
  const q = (s: string) => p.$queryRawUnsafe<any[]>(s);
  const cols = (await q(`SELECT column_name c FROM information_schema.columns WHERE table_name='Invoice'`)).map(r=>r.c);
  const tabs = (await q(`SELECT table_name t FROM information_schema.tables WHERE table_schema='public'`)).map(r=>r.t);
  const enums = (await q(`SELECT typname e FROM pg_type WHERE typtype='e'`)).map(r=>r.e);
  const partial = (await q(`SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
    WHERE t.typname='InvoiceStatus' AND e.enumlabel='PARTIALLY_PAID'`)).length > 0;
  const miss = {
    columns: need.cols.filter(c => !cols.includes(c)),
    tables: need.tables.filter(t => !tabs.includes(t)),
    enums: need.enums.filter(e => !enums.includes(e)),
    partiallyPaid: partial,
  };
  const ready = !miss.columns.length && !miss.tables.length && !miss.enums.length && partial;
  console.log(ready ? 'READY — schema is fully migrated' : 'NOT READY');
  if (!ready) {
    if (miss.columns.length) console.log('  missing columns:', miss.columns.join(', '));
    if (miss.tables.length)  console.log('  missing tables :', miss.tables.join(', '));
    if (miss.enums.length)   console.log('  missing enums  :', miss.enums.join(', '));
    if (!partial)            console.log('  missing enum value: InvoiceStatus.PARTIALLY_PAID');
  } else {
    const b = await q(`SELECT count(*)::int n, count("balanceDue")::int filled FROM "Invoice"`);
    console.log(`  backfill: ${b[0].filled}/${b[0].n} invoices have balanceDue set` +
      (b[0].filled < b[0].n ? '  <- run the backfill' : '  <- done'));
    const s = await q(`SELECT value FROM "Settings" WHERE key='collections.autoSendLevels'`);
    console.log(`  sweep: autoSendLevels = ${s.length ? JSON.stringify(s[0].value) : 'no row (defaults to dormant)'}`);
  }
  await p.$disconnect();
})();
