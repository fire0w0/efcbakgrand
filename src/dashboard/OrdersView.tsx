import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../shared/api';
import type { MenuItem, MenuResponse, OrderEntry, OrderListResponse, PreorderResponse } from '../shared/contracts';
import { isMockMode } from './client';
import { errorMessage, formatCents } from './format';
import { href, navigate } from './nav';

const pickupTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit',
});
const formatPickup = (date: string) => pickupTime.format(new Date(date));

export default function OrdersView() {
  if (isMockMode) return <section aria-labelledby="dashboard-orders-heading">
    <h1 id="dashboard-orders-heading">Orders</h1>
    <p className="dashboard-banner">Orders are available in the connected app. This mock view does not create or change real orders.</p>
    <p><a href="/grandma/orders">Open Orders with the real API</a></p>
  </section>;
  return <LiveOrders />;
}

function LiveOrders() {
  const [data, setData] = useState<OrderListResponse | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<{ id: string; action: 'collect' | 'cancel' } | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const alive = useRef(false);
  const activeRead = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mutationInFlight = useRef(false);
  const menuCache = useRef<MenuResponse | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (!alive.current || (!force && (mutationInFlight.current || activeRead.current))) return;
    activeRead.current?.abort();
    const controller = new AbortController();
    activeRead.current = controller;
    const request = ++generation.current;
    setLoading(true);
    try {
      const [orders, items] = await Promise.all([
        api<OrderListResponse>('/orders', { signal: controller.signal }),
        menuCache.current ? Promise.resolve(menuCache.current) : api<MenuResponse>('/menu', { signal: controller.signal }),
      ]);
      if (!alive.current || request !== generation.current) return;
      menuCache.current = items;
      setMenu(items.menu_items);
      setData(orders);
      setLoadError('');
    } catch (error) {
      if (alive.current && request === generation.current && !controller.signal.aborted) setLoadError(errorMessage(error));
    } finally {
      if (request === generation.current) {
        activeRead.current = null;
        if (alive.current) setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const whenVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(whenVisible, 2000);
    window.addEventListener('focus', whenVisible);
    document.addEventListener('visibilitychange', whenVisible);
    return () => {
      alive.current = false;
      ++generation.current;
      activeRead.current?.abort();
      activeRead.current = null;
      window.clearInterval(timer);
      window.removeEventListener('focus', whenVisible);
      document.removeEventListener('visibilitychange', whenVisible);
    };
  }, [refresh]);

  async function changeStatus(order: OrderEntry, action: 'collect' | 'cancel') {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    ++generation.current;
    activeRead.current?.abort();
    activeRead.current = null;
    setLoading(false);
    setPending({ id: order.id, action });
    setActionError('');
    setNotice('');
    try {
      const response = await api<PreorderResponse>(`/preorders/${encodeURIComponent(order.id)}/${action}`, { method: 'POST', body: '{}' });
      if (!alive.current) return;
      // Preserve confirmed status even if the follow-up read fails. Older polling reads
      // have been invalidated before the write so they cannot restore a scheduled row.
      setData(current => current ? {
        ...current,
        orders: current.orders.map(row => row.id === order.id ? { ...row, ...response.preorder } : row),
      } : current);
      setNotice(`${order.pickup_name}’s order was ${action === 'collect' ? 'marked collected' : 'cancelled'}. You can find it under Past orders.`);
      setCancelId(null);
      await refresh(true);
    } catch (error) {
      if (!alive.current) return;
      setActionError(`Couldn’t ${action === 'collect' ? 'collect' : 'cancel'} ${order.pickup_name}’s order: ${errorMessage(error)}. Refresh to check its status before retrying.`);
      await refresh(true);
    } finally {
      mutationInFlight.current = false;
      if (alive.current) setPending(null);
    }
  }

  const names = useMemo(() => new Map(menu.map(item => [item.id, item.name])), [menu]);
  const upcoming = useMemo(() => (data?.orders ?? []).filter(order => order.status === 'scheduled')
    .sort((a, b) => a.pickup_at.localeCompare(b.pickup_at) || a.id.localeCompare(b.id)), [data]);
  const past = useMemo(() => (data?.orders ?? []).filter(order => order.status !== 'scheduled')
    .sort((a, b) => b.pickup_at.localeCompare(a.pickup_at) || a.id.localeCompare(b.id)), [data]);
  const orders = view === 'upcoming' ? upcoming : past;
  const needle = search.trim().toLowerCase();
  const visibleOrders = orders.filter(order => !needle || [
    order.pickup_name, order.customer_name, order.phone, order.id, order.note,
    ...order.items.map(item => names.get(item.menu_item_id) ?? item.menu_item_id),
  ].some(value => value.toLowerCase().includes(needle)));

  return <section aria-labelledby="dashboard-orders-heading" className="dashboard-orders">
    <div className="dashboard-section-head">
      <div>
        <h1 id="dashboard-orders-heading">Orders</h1>
        <p className="dashboard-muted">Your pickup queue and every past order, together.</p>
      </div>
      <button type="button" disabled={loading || Boolean(pending)} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh orders'}</button>
    </div>
    <div className="dashboard-orders-clock">
      <p>{data ? <>Demo clock: <strong>{formatPickup(data.as_of)}</strong> · Toronto time</> : 'All pickup times use Toronto time.'}</p>
      <p className="dashboard-small">Customers pay at pickup. Marking an order collected records the sale; stamps and offers are handled separately.</p>
    </div>
    <div className="dashboard-orders-controls">
      <div className="dashboard-order-filters" role="group" aria-label="Order timeline">
        <button type="button" aria-pressed={view === 'upcoming'} onClick={() => { setView('upcoming'); setCancelId(null); }}>
          Upcoming <span>{upcoming.length}</span>
        </button>
        <button type="button" aria-pressed={view === 'past'} onClick={() => { setView('past'); setCancelId(null); }}>
          Past orders <span>{past.length}</span>
        </button>
      </div>
      <label className="dashboard-search">
        <span>Search orders</span>
        <input type="search" placeholder="Name, phone, item or order ID" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
    </div>
    {loadError && <p className="dashboard-error" role="alert">Couldn’t {data ? 'refresh' : 'load'} orders: {loadError}. {data && 'Showing the last loaded orders.'} <button type="button" disabled={Boolean(pending)} onClick={() => void refresh()}>Retry</button></p>}
    {actionError && <p className="dashboard-error" role="alert">{actionError}</p>}
    {notice && <p className="dashboard-success" role="status">{notice}</p>}
    {loading && !data && <p className="dashboard-muted" role="status">Loading orders…</p>}
    {data && <>
      <p className="dashboard-muted dashboard-order-count">Showing {visibleOrders.length} of {orders.length} {view === 'upcoming' ? 'scheduled pickups · earliest first' : 'past orders · latest pickup first'}. Updates automatically.</p>
      {visibleOrders.length === 0 ? <div className="dashboard-orders-empty">
        <h2>{needle ? 'No matching orders' : view === 'upcoming' ? 'No pickups waiting' : 'No past orders yet'}</h2>
        <p>{needle ? 'Try another name, phone number or menu item.' : view === 'upcoming' ? 'New order-ahead requests will appear here automatically.' : 'Collected and cancelled orders will appear here.'}</p>
      </div> : view === 'upcoming' ? <div className="dashboard-pickup-grid">
        {visibleOrders.map(order => {
          const overdue = order.pickup_at < data.as_of;
          const busy = pending?.id === order.id;
          return <article key={order.id} className={`dashboard-pickup-card${overdue ? ' dashboard-pickup-overdue' : ''}`} aria-label={`Order for ${order.pickup_name}`}>
            <div className="dashboard-pickup-heading">
              <div><span className="dashboard-order-eyebrow">Requested pickup</span><h2>{formatPickup(order.pickup_at)}</h2></div>
              <span className={`dashboard-badge ${overdue ? 'dashboard-badge-lapsed' : 'dashboard-status-scheduled'}`}>{overdue ? 'Overdue' : 'Scheduled'}</span>
            </div>
            {overdue && <p className="dashboard-overdue-hint">Pickup time has passed; this order is still waiting for collection.</p>}
            <OrderCustomer order={order} />
            <OrderItems order={order} names={names} />
            {order.note && <p className="dashboard-order-note"><strong>Pickup note:</strong> {order.note}</p>}
            <p className="dashboard-order-total"><span>Total · CAD</span><strong>{formatCents(order.total_cents)}</strong></p>
            <p className="dashboard-small dashboard-muted">Placed {formatPickup(order.created_at)} · Order {order.id}</p>
            <div className="dashboard-actions">
              <button className="dashboard-primary" type="button" disabled={Boolean(pending)} onClick={() => void changeStatus(order, 'collect')}>{busy && pending.action === 'collect' ? 'Marking collected…' : 'Mark collected'}</button>
              <button type="button" disabled={Boolean(pending)} onClick={() => setCancelId(current => current === order.id ? null : order.id)}>{busy && pending.action === 'cancel' ? 'Cancelling…' : 'Cancel order'}</button>
            </div>
            {cancelId === order.id && <div className="dashboard-cancel-confirm">
              <p>Cancel {order.pickup_name}’s pickup? It will move to Past orders.</p>
              <div className="dashboard-actions">
                <button type="button" disabled={Boolean(pending)} onClick={() => void changeStatus(order, 'cancel')}>Confirm cancellation</button>
                <button type="button" disabled={Boolean(pending)} onClick={() => setCancelId(null)}>Keep order</button>
              </div>
            </div>}
          </article>;
        })}
      </div> : <div className="dashboard-table-wrap">
        <table className="dashboard-table dashboard-orders-table">
          <caption className="dashboard-visually-hidden">All collected and cancelled orders, latest pickup first</caption>
          <thead><tr><th scope="col">Pickup / order</th><th scope="col">Customer</th><th scope="col">Items &amp; notes</th><th scope="col" className="dashboard-num">Total (CAD)</th><th scope="col">Status</th></tr></thead>
          <tbody>{visibleOrders.map(order => <tr key={order.id}>
            <td><time dateTime={order.pickup_at}>{formatPickup(order.pickup_at)}</time><span className="dashboard-order-id">{order.id}</span><span className="dashboard-small dashboard-muted">{order.source === 'history' ? 'In-store order' : 'Order ahead'}</span></td>
            <td><OrderCustomer order={order} /></td>
            <td><OrderItems order={order} names={names} />{order.note && <p className="dashboard-order-note"><strong>Note:</strong> {order.note}</p>}</td>
            <td className="dashboard-num">{formatCents(order.total_cents)}</td>
            <td><span className={`dashboard-badge ${order.status === 'cancelled' ? 'dashboard-badge-quiet' : ''}`}>{order.status === 'cancelled' ? 'Cancelled' : 'Collected'}</span></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </section>;
}

function OrderCustomer({ order }: { order: OrderEntry }) {
  const path = `/grandma/${encodeURIComponent(order.customer_id)}`;
  return <div className="dashboard-order-customer">
    <strong>{order.pickup_name}</strong>
    <a href={href(path)} onClick={event => navigate(event, path)}>{order.customer_name}{order.customer_name !== order.pickup_name ? ' · customer profile' : ' · profile'}</a>
    <span>{order.phone}</span>
  </div>;
}

function OrderItems({ order, names }: { order: OrderEntry; names: Map<string, string> }) {
  return <ul className="dashboard-order-items">{order.items.map(item => <li key={item.menu_item_id}>
    <span>{item.quantity} × {names.get(item.menu_item_id) ?? item.menu_item_id}<small>{formatCents(item.unit_price_cents)} each</small></span>
    <span>{formatCents(item.quantity * item.unit_price_cents)}</span>
  </li>)}</ul>;
}
