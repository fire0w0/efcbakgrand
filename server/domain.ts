import type { CustomerSummary, Database, MetricsResponse } from '../src/shared/contracts';

const DAY = 86400000;
export function summaries(db: Database, now: string): CustomerSummary[] {
  return db.customers.map(customer => {
    const orders = db.orders.filter(o => o.customer_id === customer.id && o.created_at <= now)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const visits = orders.length;
    const last = orders.at(-1)?.created_at ?? null;
    const gap = visits >= 2 ? (Date.parse(last!) - Date.parse(orders[0].created_at)) / DAY / (visits - 1) : null;
    const elapsed = last ? (Date.parse(now) - Date.parse(last)) / DAY : null;
    const counts = new Map<string, number>();
    for (const order of orders) for (const item of order.items) {
      counts.set(item.menu_item_id, (counts.get(item.menu_item_id) ?? 0) + item.quantity);
    }
    const favoriteId = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
    return {
      ...customer, visits, last_visit: last, usual_gap_days: gap, days_since_last_visit: elapsed,
      favorite_item: db.menu_items.find(item => item.id === favoriteId) ?? null,
      total_spend_cents: orders.reduce((sum, order) => sum + order.total_cents, 0),
      is_lapsed: visits >= 3 && gap !== null && gap > 0 && elapsed !== null && elapsed > 2 * gap,
    };
  });
}

export function metrics(db: Database, now: string): MetricsResponse {
  const start = Date.parse(now) - 90 * DAY;
  const orders = db.orders.filter(o => Date.parse(o.created_at) >= start && o.created_at <= now);
  const visits = new Map<string, number>();
  for (const order of orders) visits.set(order.customer_id, (visits.get(order.customer_id) ?? 0) + 1);
  return {
    as_of: now,
    returning_customer_rate: visits.size ? [...visits.values()].filter(n => n >= 2).length / visits.size : 0,
    lapsed_regulars: summaries(db, now).filter(c => c.is_lapsed).length,
    offers_approved: db.offers.filter(o => o.status === 'approved' || o.status === 'redeemed').length,
    offers_redeemed: db.offers.filter(o => o.status === 'redeemed').length,
    revenue_at_risk_cents: null,
    revenue_recovered_cents: null,
  };
}
