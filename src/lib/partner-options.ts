/**
 * Which partners a contract can be put on.
 *
 * This used to be a hardcoded list of four codes inside the contract form, so a
 * partner added from the Partners page never showed up in the dropdown. The
 * list comes from the partners themselves now.
 */
export interface PartnerOption {
  id: string;
  code: string;
  name: string;
  billingModel: string;
  /** Billing entity the partner belongs to. Older payloads may not carry it. */
  entityCode?: string;
}

/**
 * Partners belonging to a billing entity. One with no entity recorded is shown
 * rather than hidden — an incomplete list is the bug being fixed here.
 */
export function partnersForEntity<T extends PartnerOption>(partners: T[], entityCode: string): T[] {
  return partners.filter((p) => !p.entityCode || p.entityCode === entityCode);
}

/**
 * The partner a new contract starts on: that entity's direct billing partner
 * when it has one, otherwise its first partner.
 */
export function defaultPartnerFor(entityCode: string, partners: PartnerOption[]): string {
  const mine = partnersForEntity(partners, entityCode);
  const direct = mine.find((p) => p.billingModel === 'DIRECT' && p.code.startsWith('Direct-'));
  return (direct ?? mine[0])?.code ?? '';
}
