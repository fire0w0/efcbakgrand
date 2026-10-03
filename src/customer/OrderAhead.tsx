import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../shared/api';
import { Icon, Scallop } from '../shared/brand';
import type { HubResponse, MenuItem, Preorder, PreorderRequest, PreorderResponse } from '../shared/contracts';
import { dateFormat, dateKeyFormat, message, money, pickupFormat, timeFormat } from './format';
import Treat, { treatFor } from './Treat';

// The "Preorder" card from the design canvas, keeping the original order-ahead guarantees:
// one idempotent request ID per attempt, a pending copy in sessionStorage so a lost response
// can be confirmed by the next hub poll, and a 15-minute-to-7-day Toronto pickup window.

export interface OrderPrefill { key: number; items: Record<string, number>; }

const storageKey = (customerId: string) => `bakeria.pendingPreorder.${customerId}`;

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

interface Props {
  hub: HubResponse;
  menu: MenuItem[];
  menuError: string;
  onRetryMenu: () => void;
  prefill: OrderPrefill | null;
  onPrefillApplied: () => void;
  onPlaced: () => Promise<boolean>;
}

export default function OrderAhead({ hub, menu, menuError, onRetryMenu, prefill, onPrefillApplied, onPlaced }: Props) {
  const customerId = hub.customer.id;
  const [restored] = useState(() => pendingOrder(customerId));
  const slots = useMemo(() => pickupSlots(hub.as_of), [hub.as_of]);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries((restored?.items ?? []).map(item => [item.menu_item_id, item.quantity])));
  const [pickupName, setPickupName] = useState(restored?.pickup_name ?? (hub.customer.name === 'New friend' ? '' : hub.customer.name));
  const [pickupAt, setPickupAt] = useState(restored?.pickup_at ?? slots[0]?.iso ?? '');
  const [note, setNote] = useState(restored?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<Preorder | null>(null);
  const pending = useRef<PreorderRequest | null>(restored);
  const lock = useRef(false);
  const mounted = useRef(true);
  const writeController = useRef<AbortController | null>(null);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; writeController.current?.abort(); };
  }, []);

  // A poll can confirm an order whose POST response was lost, including after reload.
  useEffect(() => {
    const confirmed = hub.preorders?.find(order => order.request_id === pending.current?.request_id);
    if (confirmed) {
      setReceipt(confirmed); setQuantities({}); setNote(''); setError('');
      pending.current = null; storePending(customerId, null);
    }
  }, [hub.preorders, customerId]);

  // "Add" on the menu board or "Reorder" on an old order fills the form and scrolls to it.
  useEffect(() => {
    if (!prefill) return;
    changed();
    setQuantities(prefill.items);
    section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onPrefillApplied();
  }, [prefill?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedItems = menu.filter(item => (quantities[item.id] ?? 0) > 0);
  const total = selectedItems.reduce((sum, item) => sum + item.price_cents * quantities[item.id], 0);
  const selectedDay = pickupAt ? dateKeyFormat.format(new Date(pickupAt)) : slots[0]?.day ?? '';
  const days = slots.filter((slot, index) => index === 0 || slot.day !== slots[index - 1].day);
  const daySlots = slots.filter(slot => slot.day === selectedDay);

  function changed() {
    pending.current = null; storePending(customerId, null); setError(''); setReceipt(null);
  }

  function adjust(id: string, delta: number) {
    changed();
    setQuantities(previous => ({ ...previous, [id]: Math.max(0, Math.min(20, (previous[id] ?? 0) + delta)) }));
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (!selectedItems.length) { setError('Pick at least one treat first.'); return; }
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
      setReceipt(response.preorder); setQuantities({}); setNote('');
      pending.current = null; storePending(customerId, null);
      await onPlaced();
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted && pending.current?.request_id === request.request_id) {
        setError(`We couldn’t confirm your order. ${message(cause)} Press ORDER again without changing anything to safely retry the same order.`);
      }
    } finally {
      if (mounted.current) { lock.current = false; setBusy(false); }
    }
  }

  return <section className="preorder" aria-labelledby="preorder-heading" ref={section}>
    <div className="preorder-bar"><h2 id="preorder-heading">Preorder</h2><span className="preorder-bar-note">Pay at pickup</span></div>
    <Scallop size={14} />
    <div className="preorder-body">
      {menuError ? <div className="customer-error" role="alert"><p>Couldn’t load the menu. {menuError}</p><button type="button" className="text-button" onClick={onRetryMenu}>Retry</button></div>
        : menu.length === 0 ? <p className="preorder-loading" role="status">Loading the menu…</p>
        : <form onSubmit={placeOrder} aria-busy={busy}>
          <fieldset className="preorder-items" disabled={busy}>
            <legend className="hand-label">What are you craving?</legend>
            {menu.map(item => {
              const quantity = quantities[item.id] ?? 0;
              return <div className={`preorder-item${quantity ? ' preorder-item-on' : ''}`} key={item.id}>
                <Treat kind={treatFor(item)} size={44} />
                <div className="preorder-item-name"><span>{item.name}</span><span className="preorder-item-price">{money(item.price_cents)}</span></div>
                <div className="qty" role="group" aria-label={`Quantity of ${item.name}`}>
                  <button type="button" aria-label={`One fewer ${item.name}`} onClick={() => adjust(item.id, -1)} disabled={quantity === 0}><Icon name="minus" size={16} strokeWidth={3} /></button>
                  <span className="qty-value" aria-live="polite">{quantity}</span>
                  <button type="button" aria-label={`One more ${item.name}`} onClick={() => adjust(item.id, 1)} disabled={quantity >= 20}><Icon name="plus" size={16} strokeWidth={3} /></button>
                </div>
              </div>;
            })}
          </fieldset>
          <fieldset className="preorder-details" disabled={busy}>
            <legend className="visually-hidden">Pickup details</legend>
            <label className="hand-label" htmlFor="pickup-name">Who’s picking up?</label>
            <input id="pickup-name" className="preorder-line" autoComplete="name" value={pickupName} maxLength={80} required onChange={event => { changed(); setPickupName(event.target.value); }} />
            <p className="hand-label" id="pickup-when-label">When will you pop by?</p>
            <div className="preorder-when" role="group" aria-labelledby="pickup-when-label">
              <div className="preorder-select">
                <select aria-label="Pickup date" value={selectedDay} onChange={event => { changed(); setPickupAt(slots.find(slot => slot.day === event.target.value)!.iso); }}>
                  {days.map(day => <option key={day.day} value={day.day}>{day.dateLabel}</option>)}
                </select>
                <Icon name="chevron" size={18} strokeWidth={2.5} />
              </div>
              <div className="preorder-select">
                <select aria-label="Pickup time" value={pickupAt} onChange={event => { changed(); setPickupAt(event.target.value); }}>
                  {daySlots.map(slot => <option key={slot.iso} value={slot.iso}>{slot.timeLabel}</option>)}
                </select>
                <Icon name="chevron" size={18} strokeWidth={2.5} />
              </div>
            </div>
            <label className="hand-label" htmlFor="pickup-note">Anything Grandma should know?</label>
            <input id="pickup-note" className="preorder-line" type="text" maxLength={300} value={note} placeholder="optional" onChange={event => { changed(); setNote(event.target.value); }} />
          </fieldset>
          <div className="preorder-total"><span>Total · pay at pickup</span><strong>{money(total)}</strong></div>
          {error && <p className="customer-error" role="alert">{error}</p>}
          <button className="ui-pill ui-pill-big preorder-submit" type="submit" disabled={busy}><Icon name="cart" size={24} />{busy ? 'SENDING…' : 'ORDER'}</button>
          {receipt && <p role="status" className="preorder-sent ui-hand">Sent! Grandma will have it ready {pickupFormat.format(new Date(receipt.pickup_at))}. {money(receipt.total_cents)} at pickup.</p>}
        </form>}
      <p className="preorder-fine">Demo clock {pickupFormat.format(new Date(hub.as_of))}, Toronto. Pickups from 15 minutes to 7 days ahead; times are requests, nothing is paid online.</p>
    </div>
  </section>;
}
