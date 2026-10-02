import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../shared/api';
import type { HubResponse, MenuItem, MenuResponse, Preorder, PreorderRequest, PreorderResponse } from '../shared/contracts';

const TORONTO = 'America/Toronto';
const money = (cents: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
const pickupFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, weekday: 'short', month: 'short', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, hour: 'numeric', minute: '2-digit' });
const dateKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TORONTO, year: 'numeric', month: '2-digit', day: '2-digit' });
const storageKey = (customerId: string) => `bakeria.pendingPreorder.${customerId}`;
const message = (cause: unknown) => cause instanceof Error ? cause.message : 'Please try again.';

function requestId() {
  // getRandomValues also works when a phone opens the local demo over HTTP.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pendingOrder(customerId: string): PreorderRequest | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(customerId)) || 'null') as PreorderRequest | null;
    if (saved && typeof saved.request_id === 'string' && typeof saved.pickup_name === 'string' &&
      typeof saved.pickup_at === 'string' && Number.isFinite(Date.parse(saved.pickup_at)) && typeof saved.note === 'string' &&
      Array.isArray(saved.items) && saved.items.every(item => typeof item.menu_item_id === 'string' && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20)) return saved;
  } catch { /* Storage is optional; in-memory retries still retain their request ID. */ }
  return null;
}

function storePending(customerId: string, order: PreorderRequest | null) {
  try {
    if (order) sessionStorage.setItem(storageKey(customerId), JSON.stringify(order));
    else sessionStorage.removeItem(storageKey(customerId));
  } catch { /* The current visit remains usable without session storage. */ }
}

function pickupSlots(asOf: string) {
  const quarterHour = 15 * 60_000;
  const first = Math.ceil((Date.parse(asOf) + quarterHour) / quarterHour) * quarterHour;
  const last = Date.parse(asOf) + 7 * 86_400_000;
  const slots: { iso: string; day: string; dateLabel: string; timeLabel: string }[] = [];
  for (let time = first; time <= last; time += quarterHour) {
    const date = new Date(time);
    slots.push({ iso: date.toISOString(), day: dateKeyFormat.format(date), dateLabel: dateFormat.format(date), timeLabel: timeFormat.format(date) });
  }
  return slots;
}

function OrderReceipt({ order, menu, asOf }: { order: Preorder; menu: MenuItem[]; asOf: string }) {
  const overdue = order.status === 'scheduled' && Date.parse(order.pickup_at) < Date.parse(asOf);
  return <article className="preorder-receipt">
    <div className="preorder-receipt-heading"><strong>{pickupFormat.format(new Date(order.pickup_at))}</strong><span className={`preorder-status preorder-${order.status}`}>{order.status === 'scheduled' ? overdue ? 'Awaiting pickup · overdue' : 'Scheduled' : order.status === 'collected' ? 'Collected' : 'Cancelled'}</span></div>
    <p className="input-hint">Toronto · for {order.pickup_name}</p>
    <ul>{order.items.map(item => <li key={item.menu_item_id}><span>{item.quantity} × {menu.find(menuItem => menuItem.id === item.menu_item_id)?.name ?? 'Menu item'}</span><span>{money(item.quantity * item.unit_price_cents)}</span></li>)}</ul>
    {order.note && <p className="preorder-note">{order.note}</p>}
    <div className="preorder-receipt-total"><span>{order.status === 'scheduled' ? 'Pay at pickup' : 'Order total'} · CAD</span><strong>{money(order.total_cents)}</strong></div>
    <p className="preorder-reference">Order {order.id}</p>
  </article>;
}

export default function OrderAhead({ hub, onPlaced }: { hub: HubResponse; onPlaced: () => Promise<boolean> }) {
  const customerId = hub.customer.id;
  const [restored] = useState(() => pendingOrder(customerId));
  const slots = useMemo(() => pickupSlots(hub.as_of), [hub.as_of]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState('');
  const [menuAttempt, setMenuAttempt] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries((restored?.items ?? []).map(item => [item.menu_item_id, item.quantity])));
  const [pickupName, setPickupName] = useState(restored?.pickup_name ?? (hub.customer.name === 'New friend' ? '' : hub.customer.name));
  const [pickupAt, setPickupAt] = useState(restored?.pickup_at ?? slots[0]?.iso ?? '');
  const [note, setNote] = useState(restored?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Preorder | null>(null);
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const pending = useRef<PreorderRequest | null>(restored);
  const lock = useRef(false);
  const mounted = useRef(true);
  const writeController = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; writeController.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setMenuLoading(true); setMenuError('');
    void api<MenuResponse>('/menu', { signal: controller.signal }).then(response => {
      if (!controller.signal.aborted) setMenu(response.menu_items);
    }).catch(cause => {
      if (!controller.signal.aborted) setMenuError(`Couldn’t load the menu. ${message(cause)}`);
    }).finally(() => { if (!controller.signal.aborted) setMenuLoading(false); });
    return () => controller.abort();
  }, [menuAttempt]);

  // A poll can confirm an order whose POST response was lost, including after reload.
  useEffect(() => {
    const confirmed = hub.preorders?.find(order => order.request_id === pending.current?.request_id);
    if (confirmed) {
      setReceipt(confirmed); setQuantities({}); setNote(''); setError('');
      pending.current = null; storePending(customerId, null);
    }
  }, [hub.preorders, customerId]);

  const selectedItems = menu.filter(item => (quantities[item.id] ?? 0) > 0);
  const total = selectedItems.reduce((sum, item) => sum + item.price_cents * quantities[item.id], 0);
  const selectedDay = pickupAt ? dateKeyFormat.format(new Date(pickupAt)) : slots[0]?.day ?? '';
  const days = slots.filter((slot, index) => index === 0 || slot.day !== slots[index - 1].day);
  const daySlots = slots.filter(slot => slot.day === selectedDay);
  const customerOrders = (hub.preorders ?? []).filter(order => order.customer_id === customerId);
  const orders = receipt && !customerOrders.some(order => order.id === receipt.id) ? [receipt, ...customerOrders] : customerOrders;
  const upcoming = orders.filter(order => order.status === 'scheduled').sort((a, b) => a.pickup_at.localeCompare(b.pickup_at));
  const past = orders.filter(order => order.status !== 'scheduled');
  const displayed = view === 'upcoming' ? upcoming : past;

  function changed() {
    pending.current = null; storePending(customerId, null); setError(''); setReceipt(null);
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (!selectedItems.length) { setError('Choose at least one treat before placing your order.'); return; }
    if (!pickupName.trim()) { setError('Add a name so Grandma knows who is picking up.'); return; }
    if (!slots.some(slot => slot.iso === pickupAt) && !pending.current) { setError('Choose an available pickup date and time.'); return; }
    const request: PreorderRequest = pending.current ?? {
      request_id: requestId(), pickup_name: pickupName.trim(), pickup_at: pickupAt, note: note.trim(),
      items: selectedItems.map(item => ({ menu_item_id: item.id, quantity: quantities[item.id] })),
    };
    pending.current = request; storePending(customerId, request);
    lock.current = true; setBusy(true); setError('');
    const controller = new AbortController();
    writeController.current = controller;
    try {
      const response = await api<PreorderResponse>(`/customers/${encodeURIComponent(customerId)}/preorders`, { method: 'POST', body: JSON.stringify(request), signal: controller.signal });
      if (!mounted.current || controller.signal.aborted) return;
      setReceipt(response.preorder); setView(response.preorder.status === 'scheduled' ? 'upcoming' : 'past'); setQuantities({}); setNote('');
      pending.current = null; storePending(customerId, null);
      await onPlaced();
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && pending.current?.request_id === request.request_id) setError(`We couldn’t confirm your order. ${message(cause)} Retry without changing the form to safely check the same order.`);
    } finally {
      if (mounted.current) { lock.current = false; setBusy(false); }
    }
  }

  return <section className="order-card order-ahead" aria-labelledby="order-title">
    <div><p className="eyebrow">Something to look forward to</p><h2 id="order-title">Order ahead</h2><p>Pick your treats and send your order straight to Grandma.</p></div>
    <p className="order-demo-clock">Demo clock: {pickupFormat.format(new Date(hub.as_of))}, {new Date(hub.as_of).getUTCFullYear()} · Toronto</p>
    <p className="input-hint">Request pickup from 15 minutes to 7 days ahead. Pay at the counter. Pickup times are requests, subject to bakery availability.</p>
    {menuLoading ? <p className="order-loading" role="status">Loading the menu…</p> : menuError ? <div className="customer-error" role="alert"><p>{menuError}</p><button className="text-button" onClick={() => setMenuAttempt(value => value + 1)}>Retry menu</button></div> : !menu.length ? <p className="order-loading">The menu is being prepared. Please check back soon.</p> : <form onSubmit={placeOrder} aria-busy={busy}>
      <fieldset disabled={busy} className="order-menu"><legend>Choose your treats</legend>{menu.map(item => <div className="order-menu-item" key={item.id}>
        <label htmlFor={`quantity-${item.id}`}><span>{item.name}</span><span className="order-item-price">{money(item.price_cents)} CAD each</span></label>
        <select id={`quantity-${item.id}`} aria-label={`Quantity for ${item.name}`} value={quantities[item.id] ?? 0} onChange={event => { changed(); setQuantities(previous => ({ ...previous, [item.id]: Number(event.target.value) })); }}>
          {Array.from({ length: 21 }, (_, quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
        </select>
      </div>)}</fieldset>
      <fieldset disabled={busy} className="order-details"><legend>Pickup details</legend>
        <label htmlFor="pickup-name">Pickup name</label><input id="pickup-name" autoComplete="name" value={pickupName} maxLength={80} required onChange={event => { changed(); setPickupName(event.target.value); }} />
        <div className="pickup-fields"><div><label htmlFor="pickup-date">Pickup date</label><select id="pickup-date" value={selectedDay} onChange={event => { changed(); setPickupAt(slots.find(slot => slot.day === event.target.value)!.iso); }}>{days.map(day => <option key={day.day} value={day.day}>{day.dateLabel}</option>)}</select></div>
          <div><label htmlFor="pickup-time">Pickup time</label><select id="pickup-time" value={pickupAt} onChange={event => { changed(); setPickupAt(event.target.value); }}>{daySlots.map(slot => <option key={slot.iso} value={slot.iso}>{slot.timeLabel}</option>)}</select></div></div>
        <p className="input-hint">All pickup times are in Toronto.</p>
        <label htmlFor="pickup-note">Pickup note (optional)</label><textarea id="pickup-note" rows={3} maxLength={300} value={note} placeholder="Anything Grandma should know?" onChange={event => { changed(); setNote(event.target.value); }} />
        <p className="input-hint">{note.length}/300 characters</p>
      </fieldset>
      <div className="order-total"><span>Total · CAD</span><strong>{money(total)}</strong></div>
      <p className="input-hint">Payment is at pickup. Placing an order does not use offers or add stamps.</p>
      {error && <p className="customer-error" role="alert">{error}</p>}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Placing your order…' : 'Place order'}<span aria-hidden="true">↗</span></button>
    </form>}
    {receipt && <div className="order-success" role="status"><strong>Your order is in!</strong><p>Pickup for {receipt.pickup_name} on {pickupFormat.format(new Date(receipt.pickup_at))} Toronto. {money(receipt.total_cents)} CAD{receipt.status === 'scheduled' ? ', payable at pickup.' : ` · ${receipt.status}.`}</p></div>}
    <div className="your-orders"><h3>Your orders</h3><div className="customer-order-tabs" role="group" aria-label="Your orders filter"><button type="button" aria-pressed={view === 'upcoming'} onClick={() => setView('upcoming')}>Upcoming ({upcoming.length})</button><button type="button" aria-pressed={view === 'past'} onClick={() => setView('past')}>Past ({past.length})</button></div>
      {displayed.length ? displayed.map(order => <OrderReceipt key={order.id} order={order} menu={menu} asOf={hub.as_of} />) : <p className="orders-empty">{view === 'upcoming' ? 'No upcoming orders yet. Your next sweet stop starts above.' : 'No past orders yet. Collected and cancelled orders will appear here.'}</p>}
    </div>
  </section>;
}
