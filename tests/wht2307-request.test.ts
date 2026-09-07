import { WHT2307_DEFAULTS, __test, hasVariance, Wht2307Figures } from '@/lib/wht2307-request';

const { applyWht2307Placeholders, buildHtml, varianceSentence } = __test;

/** Pull every peso figure out of rendered text, in order. */
function amounts(text: string): number[] {
  return (text.match(/[\d,]+\.\d{2}/g) ?? []).map((s) => Number(s.replace(/,/g, '')));
}

const clean: Wht2307Figures = {
  invoiced: 67200,
  withheld: 1200,
  netBilled: 66000,
  received: 66000,
  variance: 0,
  atcCode: 'WC010',
  settledDate: 'August 18, 2026',
};

const short: Wht2307Figures = { ...clean, received: 65000, variance: 1000 };

describe('2307 request reconciliation', () => {
  it('renders a ladder whose arithmetic ties out', () => {
    const body = applyWht2307Placeholders(WHT2307_DEFAULTS.body, clean);
    const [invoiced, withheld, netBilled, received] = amounts(body);
    expect(invoiced).toBe(67200);
    expect(withheld).toBe(1200);
    expect(invoiced - withheld).toBe(netBilled);
    expect(netBilled).toBe(received);
  });

  it('leaves no unreplaced placeholders', () => {
    const all = [
      WHT2307_DEFAULTS.subject,
      WHT2307_DEFAULTS.greeting,
      WHT2307_DEFAULTS.body,
      WHT2307_DEFAULTS.closing,
    ]
      .map((t) => applyWht2307Placeholders(t, clean))
      .join('\n');
    // {{billingNo}} etc. are filled by the shared replacer, not this one.
    expect(all).not.toMatch(/\{\{(invoiced|received|withheld|netBilled)Amount\}\}/);
    expect(all).not.toMatch(/\{\{(varianceLine|atcSuffix|atcCode|settledDate)\}\}/);
  });

  it('stays silent about a variance when the cash ties out', () => {
    expect(hasVariance(clean)).toBe(false);
    expect(varianceSentence(clean)).toBe('');
    const body = applyWht2307Placeholders(WHT2307_DEFAULTS.body, clean);
    expect(body).not.toMatch(/Difference|excess/);
    expect(body).not.toMatch(/\n{3,}/); // the dropped line leaves no gap
  });

  it('discloses a short payment instead of inflating the withholding', () => {
    expect(hasVariance(short)).toBe(true);
    const body = applyWht2307Placeholders(WHT2307_DEFAULTS.body, short);
    expect(body).toMatch(/Difference not yet accounted for/);
    // The certificate value must remain the withheld figure, not the 2,200 gap.
    expect(amounts(body)[1]).toBe(1200);
    expect(body).toContain('1,000.00');
  });

  it('names an overpayment rather than a shortfall', () => {
    const over: Wht2307Figures = { ...clean, received: 66500, variance: -500 };
    expect(varianceSentence(over)).toMatch(/excess/);
    expect(varianceSentence(over)).toContain('500.00');
  });

  it('ignores sub-peso rounding noise', () => {
    expect(hasVariance({ ...clean, variance: 0.4 })).toBe(false);
    expect(hasVariance({ ...clean, variance: -0.4 })).toBe(false);
  });

  it('handles the unbilled-withholding case, where tax was never billed', () => {
    // Gross 33,600 billed in full; client deducted 672 on payment.
    const unbilled: Wht2307Figures = {
      invoiced: 33600,
      withheld: 672,
      netBilled: 32928,
      received: 32928,
      variance: 0,
      atcCode: null,
      settledDate: 'July 4, 2026',
    };
    const body = applyWht2307Placeholders(WHT2307_DEFAULTS.body, unbilled);
    expect(hasVariance(unbilled)).toBe(false);
    expect(body).toContain('672.00');
    expect(body).not.toMatch(/ATC/); // no code on file, so no empty "(ATC )"
  });

  it('shows the same figures in the HTML table as the plain text', () => {
    const body = applyWht2307Placeholders(WHT2307_DEFAULTS.body, short);
    const html = buildHtml('Dear Kappa Freight,', body, 'Thanks.', short);
    expect(amounts(html)).toEqual([67200, 1200, 66000, 65000, 1000]);
    // The bullet list is replaced by the table — it must not appear twice.
    expect(html).not.toContain('•');
    expect(html).not.toContain('For your reference:');
  });
});
