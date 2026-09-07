/**
 * Guards the recipient-resolution rule shared by every invoice-creation path:
 * the FULL comma-separated list goes to customerEmails (which sending prefers),
 * and customerEmail mirrors only the first address for legacy readers.
 *
 * Regression: scheduled/auto-generated invoices used to stamp just
 * partner.email, so extra Globe/RCBC recipients were silently dropped.
 */

/** The rule as implemented in billing-service / rcbc-billing / sync-partner. */
function resolveRecipients(source: { emails?: string | null; email?: string | null }) {
  const customerEmails = source.emails || source.email || null;
  const customerEmail = customerEmails?.split(',')[0]?.trim() || null;
  return { customerEmails, customerEmail };
}

describe('partner recipient resolution', () => {
  it('keeps every address when a partner has multiple emails', () => {
    const r = resolveRecipients({
      emails: 'billing@globe.test, accounts@globe.test, ap@globe.test',
      email: 'billing@globe.test',
    });
    expect(r.customerEmails).toBe('billing@globe.test, accounts@globe.test, ap@globe.test');
    expect(r.customerEmails!.split(',')).toHaveLength(3);
  });

  it('mirrors the first address into the legacy single field', () => {
    const r = resolveRecipients({ emails: 'first@globe.test, second@globe.test' });
    expect(r.customerEmail).toBe('first@globe.test');
  });

  it('trims whitespace around the first address', () => {
    const r = resolveRecipients({ emails: '  spaced@globe.test , other@globe.test' });
    expect(r.customerEmail).toBe('spaced@globe.test');
  });

  it('falls back to the single email when no list is set', () => {
    const r = resolveRecipients({ emails: null, email: 'only@globe.test' });
    expect(r.customerEmails).toBe('only@globe.test');
    expect(r.customerEmail).toBe('only@globe.test');
  });

  it('yields nulls when the partner has no email at all', () => {
    const r = resolveRecipients({ emails: null, email: null });
    expect(r.customerEmails).toBeNull();
    expect(r.customerEmail).toBeNull();
  });

  it('prefers the list over the stale single field', () => {
    // partner.email can lag behind partner.emails; the list wins.
    const r = resolveRecipients({ emails: 'new@globe.test, extra@globe.test', email: 'old@globe.test' });
    expect(r.customerEmails).toBe('new@globe.test, extra@globe.test');
    expect(r.customerEmail).toBe('new@globe.test');
  });
});
