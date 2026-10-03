import { randomUUID } from 'node:crypto';
import type { Database, OrderEntry, OrderItem, Preorder, PreorderStatus } from '../src/shared/contracts';
import { config } from './config';
import { conflict, invalid, missing, objectBody } from './validation';

const MINUTE = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== 'string') invalid(`${label} must be text`);
  const result = value.trim();
  if (result.length < min || result.length > max) invalid(`${label} must be ${min} to ${max} characters`);
  return result;
}

export function placePreorder(db: Database, customerId: string, value: unknown): { preorder: Preorder; created: boolean } {
  const body = objectBody(value, ['request_id', 'pickup_name', 'pickup_at', 'note', 'items']);
  if (!db.customers.some(customer => customer.id === customerId)) missing('Customer');
  if (typeof body.request_id !== 'string' || !UUID.test(body.request_id)) invalid('Request ID must be a UUID');
  const requestId = body.request_id.toLowerCase();
  const pickupName = text(body.pickup_name, 'Pickup name', 1, 80);
  const note = text(body.note, 'Pickup note', 0, 300);
  if (typeof body.pickup_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.pickup_at) ||
    !Number.isFinite(Date.parse(body.pickup_at)) || new Date(body.pickup_at).toISOString() !== body.pickup_at) {
    invalid('Choose a valid pickup date and time');
  }
  const pickupAt = body.pickup_at;
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > db.menu_items.length) {
    invalid('Choose at least one menu item');
  }
  const seen = new Set<string>();
  const requested = body.items.map(value => {
    const item = objectBody(value, ['menu_item_id', 'quantity']);
    if (typeof item.menu_item_id !== 'string' || !db.menu_items.some(menu => menu.id === item.menu_item_id)) invalid('Unknown menu item');
    if (seen.has(item.menu_item_id)) invalid('Choose each menu item only once');
    seen.add(item.menu_item_id);
    if (typeof item.quantity !== 'number' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      invalid('Each quantity must be a whole number from 1 to 20');
    }
    return { menu_item_id: item.menu_item_id, quantity: item.quantity };
  }).sort((a, b) => a.menu_item_id.localeCompare(b.menu_item_id));

  const existing = db.preorders?.find(preorder => preorder.request_id === requestId);
  if (existing) {
    const originalItems = existing.items.map(({ menu_item_id, quantity }) => ({ menu_item_id, quantity }))
      .sort((a, b) => a.menu_item_id.localeCompare(b.menu_item_id));
    if (existing.customer_id !== customerId || existing.pickup_name !== pickupName || existing.pickup_at !== pickupAt ||
      existing.note !== note || JSON.stringify(originalItems) !== JSON.stringify(requested)) {
      conflict('This request already belongs to a different order. Start a new order.');
    }
    // Keep the original prices and allow a retry even after its pickup time has passed.
    return { preorder: existing, created: false };
  }

  const delay = Date.parse(pickupAt) - Date.parse(config.demoNow);
  if (delay < 15 * MINUTE || delay > 7 * 24 * 60 * MINUTE) invalid('Choose pickup between 15 minutes and 7 days from the demo clock');
  const items: OrderItem[] = requested.map(item => ({ ...item,
    unit_price_cents: db.menu_items.find(menu => menu.id === item.menu_item_id)!.price_cents,
  }));
  const total = items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);
  if (!Number.isSafeInteger(total) || total < 0) invalid('The selected items cannot be priced');
  const preorder: Preorder = { id: randomUUID(), request_id: requestId, customer_id: customerId,
    pickup_name: pickupName, pickup_at: pickupAt, note, items, total_cents: total,
    status: 'scheduled', created_at: config.demoNow, collected_at: null };
  (db.preorders ??= []).push(preorder);
  return { preorder, created: true };
}

export function finishPreorder(db: Database, id: string, status: Exclude<PreorderStatus, 'scheduled'>): Preorder {
  const preorder = db.preorders?.find(order => order.id === id) ?? missing('Order');
  if (preorder.status === status) return preorder;
  if (preorder.status !== 'scheduled') conflict(`This order has already been ${preorder.status}.`);
  if (status === 'collected') {
    db.orders.push({ id: preorder.id, customer_id: preorder.customer_id, items: structuredClone(preorder.items),
      total_cents: preorder.total_cents, created_at: config.demoNow });
    preorder.collected_at = config.demoNow;
  }
  preorder.status = status;
  return preorder;
}

export function orderEntries(db: Database): OrderEntry[] {
  const preorders = db.preorders ?? [];
  const preorderIds = new Set(preorders.map(order => order.id));
  const entries: OrderEntry[] = db.orders.filter(order => !preorderIds.has(order.id)).map(order => {
    const customer = db.customers.find(customer => customer.id === order.customer_id)!;
    return { ...order, customer_name: customer.name, phone: customer.phone, pickup_name: customer.name,
      pickup_at: order.created_at, note: '', status: 'collected', source: 'history' };
  });
  for (const preorder of preorders) {
    const customer = db.customers.find(customer => customer.id === preorder.customer_id)!;
    entries.push({ id: preorder.id, customer_id: preorder.customer_id, items: preorder.items,
      total_cents: preorder.total_cents, created_at: preorder.created_at, customer_name: customer.name,
      phone: customer.phone, pickup_name: preorder.pickup_name, pickup_at: preorder.pickup_at,
      note: preorder.note, status: preorder.status, source: 'order_ahead' });
  }
  return entries.sort((a, b) => b.pickup_at.localeCompare(a.pickup_at) || a.id.localeCompare(b.id));
}
