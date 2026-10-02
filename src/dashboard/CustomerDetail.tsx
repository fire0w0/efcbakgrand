import { useEffect, useState } from 'react';
import type { CustomerDetailResponse, MenuItem, Order } from '../shared/contracts';
import { client } from './client';
import { errorMessage, firstName, formatCents, formatDate, formatWeekday, pluralDays, roundDays } from './format';
import { href, navigate } from './nav';
import OfferPanel from './OfferPanel';

const REWARD_TARGET = 10;

export default function CustomerDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [menu, setMenu] = useState<Map<string, MenuItem> | null>(null);
  const [menuError, setMenuError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [stampPending, setStampPending] = useState(false);
  const [stampError, setStampError] = useState('');

  useEffect(() => {
    let cancelled = false;
    client.menu()
      .then(m => { if (!cancelled) setMenu(new Map(m.menu_items.map(item => [item.id, item]))); })
      .catch(e => { if (!cancelled) setMenuError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    client.customer(id)
      .then(d => { if (!cancelled) { setDetail(d); setError(''); } })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, reload]);

  const refetch = () => setReload(n => n + 1);

  async function addStamp() {
    setStampPending(true); setStampError('');
    try {
      const { customer } = await client.addStamp(id);
      setDetail(d => d && { ...d, customer: { ...d.customer, stamps: customer.stamps } });
      refetch();
    } catch (e) {
      setStampError(`Couldn’t add a stamp: ${errorMessage(e)}`);
    } finally { setStampPending(false); }
  }

  const back = <p><a href={href('/grandma')} onClick={e => navigate(e, '/grandma')}>← All regulars</a></p>;

  if (error && !detail) {
    return <section>{back}<h1>Customer unavailable</h1>
      <p className="dashboard-error" role="alert">{error} <button type="button" onClick={refetch}>Retry</button></p>
    </section>;
  }
  if (!detail) return <section>{back}<p className="dashboard-muted" role="status">Loading customer…</p></section>;

  const { customer, orders, offers } = detail;
  const first = firstName(customer.name);
  const days = roundDays(customer.days_since_last_visit);
  const gap = roundDays(customer.usual_gap_days);
  const hubPath = `/hub/${encodeURIComponent(customer.id)}`;

  return <section aria-busy={loading}>
    {back}
    <header className="dashboard-customer-head">
      <div>
        <h1>{customer.name}</h1>
        <p className="dashboard-muted">{customer.phone} · Joined {formatDate(customer.joined_at)}</p>
      </div>
      <a className="dashboard-hub-link" href={hubPath} target="_blank" rel="noopener noreferrer">Open {first}’s hub (rehearsal) ↗</a>
    </header>
    {error && <p className="dashboard-error" role="alert">Latest refresh failed: {error} <button type="button" onClick={refetch}>Retry</button></p>}

    {customer.is_lapsed
      ? <p className="dashboard-banner dashboard-banner-lapsed" role="status">
        <strong>Drifting away.</strong> {days !== null && `${pluralDays(days)} since the last visit`}{gap !== null && `, usually every ${pluralDays(gap)}`}.
      </p>
      : (days !== null && <p className="dashboard-banner" role="status">
        Last visit {pluralDays(days)} ago{gap !== null ? `; usually visits every ${pluralDays(gap)}` : ''}.
      </p>)}

    <dl className="dashboard-facts">
      <div><dt>Visits</dt><dd>{customer.visits}</dd></div>
      <div><dt>Favorite</dt><dd>{customer.favorite_item?.name ?? <span className="dashboard-muted">No orders yet</span>}</dd></div>
      <div><dt>Last visit</dt><dd>{formatDate(customer.last_visit)}</dd></div>
      <div><dt>Total spend</dt><dd>{formatCents(customer.total_spend_cents)}</dd></div>
    </dl>

    <section className="dashboard-stamps" aria-labelledby="dashboard-stamps-heading">
      <div className="dashboard-section-head">
        <h2 id="dashboard-stamps-heading">Reward card · {customer.stamps} / {REWARD_TARGET}</h2>
        <button type="button" className="dashboard-primary" onClick={addStamp} disabled={stampPending}>
          {stampPending ? 'Adding…' : 'Add stamp'}
        </button>
      </div>
      <div className="dashboard-stamp-row" aria-hidden="true">
        {Array.from({ length: REWARD_TARGET }, (_, i) => <span key={i} className={`dashboard-stamp${i < customer.stamps ? ' dashboard-stamp-on' : ''}`} />)}
      </div>
      <p className="dashboard-muted dashboard-small">Mocked checkout: a stamp updates {first}’s phone card but records no sale. Redemption happens on the customer’s phone.</p>
      {stampError && <p className="dashboard-error" role="alert">{stampError} <button type="button" onClick={addStamp} disabled={stampPending}>Try again</button></p>}
    </section>

    <OfferPanel customerId={customer.id} customerName={customer.name} offers={offers} onChanged={refetch} />

    <section aria-labelledby="dashboard-orders-heading">
      <h2 id="dashboard-orders-heading">Order history</h2>
      {menuError && <p className="dashboard-error" role="alert">Menu names unavailable ({menuError}); showing item IDs.</p>}
      {orders.length === 0
        ? <p className="dashboard-muted">No orders yet.</p>
        : <div className="dashboard-table-wrap"><table className="dashboard-table">
          <thead><tr><th scope="col">Date</th><th scope="col">Items</th><th scope="col" className="dashboard-num">Total</th></tr></thead>
          <tbody>{orders.map(order => <OrderRow key={order.id} order={order} menu={menu} />)}</tbody>
        </table></div>}
    </section>
  </section>;
}

function OrderRow({ order, menu }: { order: Order; menu: Map<string, MenuItem> | null }) {
  return <tr>
    <td>{formatWeekday(order.created_at)} {formatDate(order.created_at)}</td>
    <td>
      <ul className="dashboard-items">
        {order.items.map((item, index) => <li key={index}>
          {item.quantity} × {menu?.get(item.menu_item_id)?.name ?? <span className="dashboard-muted">{menu ? `Unknown item (${item.menu_item_id})` : item.menu_item_id}</span>}
          <span className="dashboard-muted"> @ {formatCents(item.unit_price_cents)}</span>
        </li>)}
      </ul>
    </td>
    <td className="dashboard-num">{formatCents(order.total_cents)}</td>
  </tr>;
}
