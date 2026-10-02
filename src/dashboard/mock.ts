import type { Customer, CustomerSummary, Offer, OfferStatus } from '../shared/contracts';
import type { DashboardClient } from './client';
import { firstName } from './format';

// Branch-local development mock, selected only by the explicit ?mock=1 flag.
// Reads still hit the real commit-0 API. Mutations are simulated as an in-memory overlay
// that follows the existing CONTRACTS.md rules (stamp cap, draft-only edits, forward-only
// offer states). Nothing persists and nothing here is part of the demo path.

interface OverlayOffer { offer: Offer; baseStatus: OfferStatus | null; }
const everApproved = (status: OfferStatus | null) => status === 'approved' || status === 'redeemed';
const fail = (message: string): Promise<never> => Promise.reject(new Error(`${message} (mock)`));

function toCustomer(c: Customer): Customer {
  return { id: c.id, name: c.name, phone: c.phone, joined_at: c.joined_at, stamps: c.stamps };
}

function template(customer: CustomerSummary): string {
  const favorite = customer.favorite_item?.name;
  const middle = favorite ? `Your ${favorite} is waiting, and` : 'Come say hello:';
  return `Hi ${firstName(customer.name)}! We miss seeing you at Bakeria. ${middle} a topping is on us with your next parfait. Love, Grandma`;
}

export function createMockClient(real: DashboardClient): DashboardClient {
  const stamps = new Map<string, number>();
  const overlay = new Map<string, OverlayOffer>();
  const seen = new Map<string, Offer>();
  let asOf: string | null = null;
  let sequence = 0;

  async function clock(): Promise<string> {
    if (!asOf) asOf = (await real.config()).as_of;
    // One extra millisecond per mock write keeps newest-first ordering deterministic.
    return new Date(Date.parse(asOf) + ++sequence).toISOString();
  }
  const patch = <T extends Customer>(c: T): T => ({ ...c, stamps: stamps.get(c.id) ?? c.stamps });
  const find = (id: string): OverlayOffer | undefined => {
    const existing = overlay.get(id);
    if (existing) return existing;
    const base = seen.get(id);
    return base ? { offer: base, baseStatus: base.status } : undefined;
  };

  return {
    config: () => real.config(),
    menu: () => real.menu(),
    metrics: async () => {
      const metrics = await real.metrics();
      let approved = 0;
      let redeemed = 0;
      for (const { offer, baseStatus } of overlay.values()) {
        approved += Number(everApproved(offer.status)) - Number(everApproved(baseStatus));
        redeemed += Number(offer.status === 'redeemed') - Number(baseStatus === 'redeemed');
      }
      return { ...metrics, offers_approved: metrics.offers_approved + approved, offers_redeemed: metrics.offers_redeemed + redeemed };
    },
    customers: async query => {
      const list = await real.customers(query);
      return { ...list, customers: list.customers.map(patch) };
    },
    customer: async id => {
      const detail = await real.customer(id);
      for (const offer of detail.offers) seen.set(offer.id, offer);
      const merged = new Map(detail.offers.map(offer => [offer.id, offer] as const));
      for (const { offer } of overlay.values()) if (offer.customer_id === id) merged.set(offer.id, offer);
      const offers = [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      return { ...detail, customer: patch(detail.customer), offers };
    },
    addStamp: async id => {
      const { customer } = await real.customer(id);
      const current = stamps.get(id) ?? customer.stamps;
      if (current >= 10) return fail('Reward card is already full at 10 stamps');
      stamps.set(id, current + 1);
      return { customer: toCustomer(patch(customer)) };
    },
    draftOffer: async customerId => {
      const detail = await real.customer(customerId);
      const cached = detail.offers.find(offer => offer.source === 'cached');
      const created_at = await clock();
      const offer: Offer = {
        id: `mock_offer_${sequence}`, customer_id: customerId, status: 'draft', source: 'cached', created_at,
        message: cached?.message ?? template(detail.customer),
      };
      overlay.set(offer.id, { offer, baseStatus: null });
      return { offer };
    },
    saveOffer: async (id, message) => {
      const entry = find(id);
      if (!entry) return fail('Offer not found');
      const trimmed = message.trim();
      if (trimmed.length < 1 || trimmed.length > 280) return fail('Offer message must be 1–280 characters');
      if (entry.offer.status !== 'draft') return fail('Only draft offers can be edited');
      const next: OverlayOffer = { ...entry, offer: { ...entry.offer, message: trimmed } };
      overlay.set(id, next);
      return { offer: next.offer };
    },
    approveOffer: async id => {
      const entry = find(id);
      if (!entry) return fail('Offer not found');
      if (entry.offer.status === 'redeemed') return fail('Offer was already redeemed');
      const next: OverlayOffer = { ...entry, offer: { ...entry.offer, status: 'approved' } };
      overlay.set(id, next);
      return { offer: next.offer };
    },
  };
}
