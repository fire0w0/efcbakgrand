import { mkdirSync, writeFileSync } from 'node:fs';
import type { Database, Customer, Order } from '../src/shared/contracts';

const anchor = Date.parse('2026-10-02T22:30:00.000Z');
const date = (daysAgo: number) => new Date(anchor - daysAgo * 86400000).toISOString();
const names = ['Ava Martin', 'Noah Wilson', 'Olivia Brown', 'Liam Roy', 'Emma Tremblay', 'William Lee',
  'Charlotte Wong', 'Benjamin Singh', 'Amelia Chen', 'Lucas Dubois', 'Sophia Ahmed', 'James Thompson',
  'Mia Garcia', 'Henry Clarke', 'Isla Nguyen', 'Theodore Scott', 'Evelyn Lewis', 'Jack Robinson',
  'Harper Young', 'Leo Walker', 'Aria Hall', 'Owen Allen', 'Ella Wright', 'Ethan King',
  'Maya Patel', 'Daniel Brooks', 'Sofia Rossi', 'Eli Campbell', 'Grace Park', 'Samuel Morgan',
  'Chloe Adams', 'Mateo Rivera', 'Lily Evans', 'Adam Murphy', 'Nora Bell', 'Isaac Cooper',
  'Zoey Richardson', 'Julian Cox', 'Layla Howard', 'Caleb Ward', 'Hannah Wood', 'Nathan Price',
  'Violet Bennett', 'Aaron Gray', 'Stella James', 'Ryan Kelly', 'Lucy Green', 'David Ross',
  'Alice Foster', 'Zachary Perry'];
const menu_items = [
  { id: 'menu_strawberry', name: 'Strawberry Cloud Parfait', price_cents: 750 },
  { id: 'menu_mango', name: 'Mango Sunshine Parfait', price_cents: 800 },
  { id: 'menu_chocolate', name: 'Chocolate Hug Parfait', price_cents: 850 },
  { id: 'menu_vanilla', name: 'Vanilla Berry Parfait', price_cents: 700 },
  { id: 'menu_coffee', name: 'Grandma’s Coffee', price_cents: 300 },
];
const customers: Customer[] = [];
const orders: Order[] = [];
for (let i = 0; i < 50; i++) {
  const id = `cus_${String(i + 1).padStart(3, '0')}`;
  const gaps = i < 24
    ? Array.from({ length: 12 }, (_, visit) => 1 + i % 6 + visit * 7)
    : i < 28
      ? Array.from({ length: 9 }, (_, visit) => 22 + i % 2 + visit * 7)
      : i < 30 ? [32, 45, 58, 71, 84] : i % 2 === 0 ? [4 + i % 16, 52 + i % 12] : [5 + i % 20];
  customers.push({ id, name: names[i], phone: `+1519555${String(101 + i).padStart(4, '0')}`,
    joined_at: date(Math.max(...gaps) + 1), stamps: i === 24 ? 9 : i % 10 });
  const favorite = menu_items[i % 4];
  for (const [visit, daysAgo] of [...gaps].reverse().entries()) {
    const item = visit % 5 === 4 ? menu_items[(i + 1) % 4] : favorite;
    const items = [{ menu_item_id: item.id, quantity: 1, unit_price_cents: item.price_cents }];
    if (visit % 3 === 1) items.push({ menu_item_id: 'menu_coffee', quantity: 1, unit_price_cents: 300 });
    orders.push({ id: `ord_${String(orders.length + 1).padStart(5, '0')}`, customer_id: id, items,
      total_cents: items.reduce((sum, line) => sum + line.quantity * line.unit_price_cents, 0), created_at: date(daysAgo) });
  }
}
const offers: Database['offers'] = customers.slice(24, 30).map((customer, index) => ({
  id: `offer_cache_${customer.id}`, customer_id: customer.id,
  message: `Hi ${customer.name.split(' ')[0]}! We miss seeing you at Bakeria. Your ${menu_items[index % 4].name} is waiting, and a topping is on us with your next parfait. Love, Grandma`,
  status: 'draft', source: 'cached', created_at: date(0),
}));
const seed: Database = { menu_items, customers, orders, offers };
mkdirSync('data', { recursive: true });
writeFileSync('data/seed.json', JSON.stringify(seed, null, 2) + '\n');
console.log(`Seeded ${customers.length} customers, ${orders.length} orders, ${offers.length} cached drafts.`);
