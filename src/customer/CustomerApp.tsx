import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../shared/api';
import { BrandHeader, Icon, Scallop, Tag } from '../shared/brand';
import type { CustomerDetailResponse, HubResponse, MenuItem, MenuResponse, Offer, OrderItem } from '../shared/contracts';
import { dateDay, dateShort, firstName, message, money, pickupFormat } from './format';
import OrderAhead, { type OrderPrefill } from './OrderAhead';
import Treat, { treatFor, type TreatKind } from './Treat';
import { useCustomerHistory } from './useCustomerHistory';
import { useCustomerHub } from './useCustomerHub';
import './customer.css';

// Customer hub rebuilt from the design canvas (Main, MyCard, RecentOrders, Offers artboards).
// Screens are hash views on /hub so the saved customer and the two-second polling are untouched.

type View = 'home' | 'card' | 'orders';
const SLOT_KINDS = ['dot', 'heart', 'star', 'square', 'x'] as const;
const SLOT_TILTS = [-6, 4, -3, 7, -4, 3, -7, 5, -5, 6];
type CategoryId = 'parfaits' | 'drinks' | 'treats';
const CATEGORIES: { id: CategoryId; label: string; fill: string; dot: string }[] = [
  { id: 'parfaits', label: 'Parfaits', fill: '#CDBBE6', dot: '#B49AD9' },
  { id: 'drinks', label: 'Drinks', fill: '#B5CFE6', dot: '#8FB5D9' },
  { id: 'treats', label: 'Treats', fill: '#BFDDB0', dot: '#9CC48A' },
];

function categoryOf(item: MenuItem): CategoryId {
  if (/parfait/i.test(item.name)) return 'parfaits';
  if (/coffee|tea|latte|mocha|lemonade|juice|cocoa/i.test(item.name)) return 'drinks';
  return 'treats';
}

function viewFromHash(): View {
  const hash = window.location.hash;
  return hash === '#card' ? 'card' : hash === '#orders' ? 'orders' : 'home';
}

function useView(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const sync = () => setView(viewFromHash());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  const go = (next: View) => {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${next === 'home' ? '' : `#${next}`}`);
    setView(next);
    window.scrollTo({ top: 0 });
  };
  return [view, go];
}

function useMenu() {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuError, setMenuError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setMenuError('');
    api<MenuResponse>('/menu', { signal: controller.signal })
      .then(response => { if (!controller.signal.aborted) setMenu(response.menu_items); })
      .catch(cause => { if (!controller.signal.aborted) setMenuError(message(cause)); });
    return () => controller.abort();
  }, [attempt]);
  return { menu, menuError, retryMenu: () => setAttempt(n => n + 1) };
}

function summarize(items: OrderItem[], menuById: Map<string, MenuItem>): string {
  if (!items.length) return 'Order';
  const [first] = items;
  const name = menuById.get(first.menu_item_id)?.name ?? 'Treat';
  const head = first.quantity > 1 ? `${first.quantity} × ${name}` : name;
  return items.length > 1 ? `${head} +${items.length - 1} more` : head;
}

function kindOf(items: OrderItem[], menuById: Map<string, MenuItem>): TreatKind {
  const item = items.length ? menuById.get(items[0].menu_item_id) : undefined;
  return item ? treatFor(item) : 'vanillaparfait';
}

export default function CustomerApp() {
  const { customerId, hub, loading, busy, error, notice, join, switchCustomer, refresh, redeemOffer } = useCustomerHub();
  const [view, go] = useView();
  const [offersOpen, setOffersOpen] = useState(false);
  const [prefill, setPrefill] = useState<OrderPrefill | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const { menu, menuError, retryMenu } = useMenu();
  const visibleHub = hub?.customer.id === customerId ? hub : null;
  const signature = visibleHub ? `${visibleHub.customer.stamps}|${visibleHub.preorders.map(order => order.id + order.status).join(',')}` : '';
  const { history } = useCustomerHistory(visibleHub ? visibleHub.customer.id : null, signature);
  const offers = visibleHub?.offers.filter(offer => offer.customer_id === customerId && (offer.status === 'approved' || offer.status === 'redeemed')) ?? [];
  const activeOffers = offers.filter(offer => offer.status === 'approved');
  const menuById = useMemo(() => new Map(menu.map(item => [item.id, item])), [menu]);
  const favorite = history?.customer.favorite_item ?? null;
  const treat: TreatKind = favorite ? treatFor(favorite) : 'berryparfait';
  const first = visibleHub && visibleHub.customer.name !== 'New friend' ? firstName(visibleHub.customer.name) : null;
  const target = visibleHub?.reward_target ?? 10;
  const stamps = visibleHub?.customer.stamps ?? 0;

  function orderItems(items: { menu_item_id: string; quantity: number }[]) {
    const entries = items.filter(item => menuById.has(item.menu_item_id)).map(item => [item.menu_item_id, Math.min(20, item.quantity)] as const);
    setPrefill({ key: Date.now(), items: Object.fromEntries(entries) });
    if (view !== 'home') go('home');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const compact = phone.trim().replace(/[\s().-]/g, '');
    if (!/^(?:\d{10}|\+?1\d{10})$/.test(compact)) { setPhoneError('Enter a 10-digit phone number, or include +1.'); return; }
    setPhoneError('');
    await join(phone.trim());
  }

  function changeCustomer() {
    setPhone(''); setPhoneError(''); setOffersOpen(false); switchCustomer(); go('home');
  }

  const feedback = <>
    {error && <div className="customer-error" role="alert"><p>{error}</p>{customerId && <button type="button" className="text-button" onClick={() => void refresh()}>Refresh</button>}</div>}
    <div className="customer-notice" role="status" aria-live="polite">{notice}</div>
  </>;

  const headerNav = customerId ? <>
    <button type="button" className="brand-icon-button" aria-label={`Offers${activeOffers.length ? `, ${activeOffers.length} waiting` : ''}`} onClick={() => setOffersOpen(true)}>
      <Icon name="bell" size={26} />{activeOffers.length > 0 && <span className="hub-bell-count" aria-hidden="true">{activeOffers.length}</span>}
    </button>
    <button type="button" className="brand-icon-button" aria-label="Refresh my card" onClick={() => void refresh()}><Icon name="refresh" size={24} /></button>
    <button type="button" className="brand-icon-button" aria-label="Switch customer" onClick={changeCustomer}><Icon name="user" size={26} /></button>
  </> : null;

  return <div className="customer">
    <BrandHeader homeHref="/hub" onHome={event => { event.preventDefault(); go('home'); }} subtitle="A little sweetness, a familiar face">{headerNav}</BrandHeader>
    <main className="hub-main">
      {feedback}
      {!customerId
        ? <JoinScreen phone={phone} setPhone={value => { setPhone(value); setPhoneError(''); }} phoneError={phoneError} busy={busy === 'join'} onSubmit={submit} />
        : loading && !visibleHub
          ? <section className="hub-loading" role="status"><Treat kind="berryparfait" size={120} /><p className="ui-hand hub-loading-text">finding your little corner<br />of the bakery…</p></section>
          : visibleHub && (view === 'card'
            ? <CardScreen first={first} stamps={stamps} target={target} go={go} />
            : view === 'orders'
              ? <OrdersScreen hub={visibleHub} history={history} menuById={menuById} onOrder={orderItems} go={go} />
              : <HomeScreen hub={visibleHub} first={first} stamps={stamps} target={target} treat={treat} favoriteId={favorite?.id ?? null}
                history={history} menu={menu} menuError={menuError} retryMenu={retryMenu} menuById={menuById} activeOffers={activeOffers}
                onOpenOffers={() => setOffersOpen(true)} go={go} onOrder={orderItems} prefill={prefill} onPrefillApplied={() => setPrefill(null)} onPlaced={refresh} />)}
    </main>
    <footer className="hub-footer">
      <p>Grandma’s Bakeria · a demo: phone identity, stamps and redemptions are simulated.</p>
      <a href="/grandma">Grandma’s view</a>
    </footer>
    {offersOpen && visibleHub && <OffersDialog offers={offers} treat={treat} busy={busy} onRedeem={redeemOffer} onClose={() => setOffersOpen(false)} />}
  </div>;
}

function JoinScreen({ phone, setPhone, phoneError, busy, onSubmit }: { phone: string; setPhone: (value: string) => void; phoneError: string; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <section className="join">
    <div className="join-intro">
      <p className="ui-eyebrow">Your little corner of the bakery</p>
      <h1 className="ui-hand join-title">there’s always<br />a place for you.</h1>
      <p className="join-blurb">Your stamps, a note from Grandma, and something sweet to look forward to.</p>
      <div className="join-art" aria-hidden="true"><Treat kind="berryparfait" size={150} /><Treat kind="mangoparfait" size={150} /></div>
    </div>
    <form className="join-card ui-card" onSubmit={onSubmit} noValidate aria-busy={busy}>
      <h2 className="ui-display">Let’s find your card.</h2>
      <p className="join-sub">Just your phone number. No password, no app.</p>
      <label className="hand-label" htmlFor="customer-phone">Phone number</label>
      <input id="customer-phone" className="join-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(519) 555-0125" value={phone}
        onChange={event => setPhone(event.target.value)} aria-invalid={Boolean(phoneError)} aria-describedby={phoneError ? 'phone-error' : 'phone-hint'} disabled={busy} required />
      <p id="phone-hint" className="join-hint">Canadian or US number with area code.</p>
      {phoneError && <p id="phone-error" className="customer-error" role="alert">{phoneError}</p>}
      <button className="ui-pill ui-pill-big join-submit" disabled={busy}>{busy ? 'FINDING…' : 'FIND MY CARD'}</button>
      <p className="join-demo ui-hand">Trying the demo? Maya’s number is (519) 555-0125.</p>
    </form>
  </section>;
}

function StampGrid({ stamps, target, size }: { stamps: number; target: number; size: 'mini' | 'big' }) {
  return <div className={`stamp-grid stamp-grid-${size}`} role="img" aria-label={`${stamps} of ${target} stamps`}>
    {Array.from({ length: target }, (_, index) => {
      const on = index < stamps;
      return <span key={index} className={`stamp-slot${on ? ' stamp-on' : ''}`} style={{ transform: `rotate(${SLOT_TILTS[index % SLOT_TILTS.length]}deg)` }}>
        {on && <StampMark kind={SLOT_KINDS[index % SLOT_KINDS.length]} />}
      </span>;
    })}
  </div>;
}

function StampMark({ kind }: { kind: typeof SLOT_KINDS[number] }) {
  switch (kind) {
    case 'dot': return <span className="mark mark-dot" />;
    case 'square': return <span className="mark mark-square" />;
    case 'heart': return <svg viewBox="0 0 24 24" className="mark-svg" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" fill="#F2A7B5" stroke="#6B2A24" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
    case 'star': return <svg viewBox="0 0 24 24" className="mark-svg" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z" fill="#CDBBE6" stroke="#6B2A24" strokeWidth="1.4" strokeLinejoin="round" /></svg>;
    case 'x': return <svg viewBox="0 0 24 24" className="mark-svg" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#6B2A24" strokeWidth="6" strokeLinecap="round" /><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#F6DE6A" strokeWidth="3.2" strokeLinecap="round" /></svg>;
  }
}

interface HomeProps {
  hub: HubResponse; first: string | null; stamps: number; target: number; treat: TreatKind; favoriteId: string | null;
  history: CustomerDetailResponse | null; menu: MenuItem[]; menuError: string; retryMenu: () => void; menuById: Map<string, MenuItem>;
  activeOffers: Offer[]; onOpenOffers: () => void; go: (view: View) => void; onOrder: (items: { menu_item_id: string; quantity: number }[]) => void;
  prefill: OrderPrefill | null; onPrefillApplied: () => void; onPlaced: () => Promise<boolean>;
}

function HomeScreen(props: HomeProps) {
  const { hub, first, stamps, target, treat, favoriteId, history, menu, menuError, retryMenu, menuById, activeOffers, onOpenOffers, go, onOrder } = props;
  const recents = history?.orders.slice(0, 2) ?? [];
  return <div className="hub-layout">
    <div className="hub-column">
      <section className="hub-hero">
        <div className="hub-welcome">
          <h1 className="hub-title ui-hand">{first ? `welcome back, ${first.toLowerCase()}!` : 'welcome, friend!'}</h1>
          <a href="#card" className="mini-card" onClick={event => { event.preventDefault(); go('card'); }} aria-label={`My card: ${stamps} of ${target} stamps`}>
            <StampGrid stamps={stamps} target={target} size="mini" />
            <div className="mini-card-foot"><span className="ui-hand">{stamps} of {target} stamps</span><span className="ui-eyebrow">free parfait at {target}</span></div>
          </a>
        </div>
        <FeatureBanner offer={activeOffers[0] ?? null} stamps={stamps} target={target} treat={treat} onOpenOffers={onOpenOffers} />
      </section>
      <MenuBoard menu={menu} menuError={menuError} retryMenu={retryMenu} favoriteId={favoriteId} onOrder={onOrder} />
    </div>
    <aside className="hub-aside">
      <nav className="account-nav" aria-label="Account">
        <a href="#orders" onClick={event => { event.preventDefault(); go('orders'); }}><Icon name="receipt" />MY ORDERS</a>
        <a href="#card" onClick={event => { event.preventDefault(); go('card'); }}><Icon name="card" />MY CARD</a>
        <button type="button" onClick={onOpenOffers}><Icon name="bell" />MY OFFERS{activeOffers.length > 0 && <span className="nav-count">{activeOffers.length}</span>}</button>
      </nav>
      <section className="recents ui-card" aria-labelledby="recents-heading">
        <h2 id="recents-heading" className="recents-heading"><Tag>Recents</Tag></h2>
        {recents.length === 0 && <p className="recents-empty">No orders yet. Your first treat starts the list.</p>}
        {recents.map(order => <article className="recent" key={order.id}>
          <div className="recent-art"><Treat kind={kindOf(order.items, menuById)} size={70} /></div>
          <div className="recent-body">
            <span className="recent-name ui-display">{summarize(order.items, menuById)}</span>
            <span className="recent-price">{money(order.total_cents)}</span>
            <span className="recent-date">Ordered {dateDay(order.created_at)}</span>
            <button type="button" className="icon-button" aria-label={`Reorder ${summarize(order.items, menuById)}`} onClick={() => onOrder(order.items)}><Icon name="refresh" size={20} /></button>
          </div>
        </article>)}
        {recents.length > 0 && <a href="#orders" className="recents-all" onClick={event => { event.preventDefault(); go('orders'); }}>All my orders</a>}
      </section>
      <OrderAhead hub={hub} menu={menu} menuError={menuError} onRetryMenu={retryMenu} prefill={props.prefill} onPrefillApplied={props.onPrefillApplied} onPlaced={props.onPlaced} />
    </aside>
  </div>;
}

function FeatureBanner({ offer, stamps, target, treat, onOpenOffers }: { offer: Offer | null; stamps: number; target: number; treat: TreatKind; onOpenOffers: () => void }) {
  const left = Math.max(0, target - stamps);
  const full = stamps >= target;
  return <section className={`hub-banner${offer ? ' hub-banner-offer' : ''}`} aria-labelledby="hub-banner-heading">
    <div className="hub-banner-sticker" aria-hidden="true">
      <span className="ui-hand hub-sticker-top">{offer ? 'from' : full ? 'card' : `${left} to`}</span>
      <span className="ui-display hub-sticker-big">{offer ? 'Grandma' : full ? 'FULL' : 'go'}</span>
    </div>
    <div className="hub-banner-treat" aria-hidden="true"><Treat kind={treat} size={190} /></div>
    <div className="hub-banner-copy">
      <p className="ui-eyebrow" id="hub-banner-heading">{offer ? 'A note from Grandma' : 'Your reward card'}</p>
      {offer ? <>
        <p className="hub-banner-sale ui-display">FREE TOPPING!</p>
        <p className="hub-banner-hand ui-hand">{offer.message}</p>
        <button type="button" className="ui-pill" onClick={onOpenOffers}>See my offers</button>
      </> : <>
        <p className="hub-banner-title ui-display">{full ? 'A full card!' : `${left} more ${left === 1 ? 'stamp' : 'stamps'}`}</p>
        <p className="hub-banner-sale ui-display">{full ? 'FREE PARFAIT!' : `${stamps}/${target}`}</p>
        <p className="hub-banner-hand ui-hand">{full ? 'ask Grandma at the counter, it’s on the house' : 'Grandma adds a stamp every time you stop by'}</p>
      </>}
    </div>
  </section>;
}

function MenuBoard({ menu, menuError, retryMenu, favoriteId, onOrder }: { menu: MenuItem[]; menuError: string; retryMenu: () => void; favoriteId: string | null; onOrder: (items: { menu_item_id: string; quantity: number }[]) => void }) {
  const [category, setCategory] = useState<'all' | CategoryId>('all');
  const present = CATEGORIES.filter(c => menu.some(item => categoryOf(item) === c.id));
  const groups = present.filter(c => category === 'all' || c.id === category).map(c => ({ ...c, items: menu.filter(item => categoryOf(item) === c.id) }));
  const chips = [{ id: 'all' as const, label: 'Everything', fill: '#F3DCC6' }, ...present];
  const tilts = [-1.5, 1, -0.5, 1.5];
  return <section className="menu-board" aria-labelledby="menu-heading">
    <div className="menu-head">
      <h2 id="menu-heading" className="menu-title">Menu</h2>
      <svg width="200" height="46" viewBox="0 0 230 52" fill="none" stroke="#6B2A24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 40s-12-7.5-12-17a7 7 0 0 1 12-4.5A7 7 0 0 1 32 23c0 9.5-12 17-12 17z" /><path d="M60 30 q8 -16 16 0 t16 0 t16 0" /><path d="M140 10 v18 M131 19 h18 M134 13 l12 12 M146 13 l-12 12" /><path d="M180 42 l10 -30 l10 30 M184 32 h12" /><path d="M212 14 v26 M212 14 q14 0 14 8 q0 8 -14 6" /></svg>
    </div>
    {menu.length > 1 && <div className="menu-chips" role="group" aria-label="Menu categories">
      {chips.map(chip => <button key={chip.id} type="button" aria-pressed={category === chip.id} onClick={() => setCategory(chip.id)}
        className="menu-chip" style={category === chip.id ? undefined : { background: chip.fill }}>{chip.label}</button>)}
    </div>}
    {menuError && <div className="customer-error" role="alert"><p>Couldn’t load the menu. {menuError}</p><button type="button" className="text-button" onClick={retryMenu}>Retry</button></div>}
    {!menuError && menu.length === 0 && <p className="menu-loading" role="status">Setting out today’s treats…</p>}
    {groups.map(group => <div className="menu-group" key={group.id}>
      <h3 className="menu-group-title"><Tag dot={group.dot}>{group.label}</Tag></h3>
      <div className="menu-grid">
        {group.items.map((item, index) => <article className="menu-item" key={item.id}>
          {item.id === favoriteId ? <span className="menu-note ui-hand">your usual!</span> : <span className="menu-note" aria-hidden="true" />}
          <Treat kind={treatFor(item)} size={118} />
          <div className="menu-pill" style={{ transform: `rotate(${tilts[index % tilts.length]}deg)` }}>
            <span className="menu-dot" style={{ background: group.dot }} aria-hidden="true" />
            <span className="menu-name">{item.name}</span>
            <span className="menu-price ui-display">{money(item.price_cents)}</span>
          </div>
          <button type="button" className="menu-add" onClick={() => onOrder([{ menu_item_id: item.id, quantity: 1 }])}><Icon name="plus" size={14} strokeWidth={3} />Add to preorder</button>
        </article>)}
      </div>
      <div className="menu-shelf" aria-hidden="true" />
    </div>)}
  </section>;
}

function CardScreen({ first, stamps, target, go }: { first: string | null; stamps: number; target: number; go: (view: View) => void }) {
  const full = stamps >= target;
  return <section className="card-screen" aria-labelledby="card-heading">
    <a href="/hub" className="back-link" onClick={event => { event.preventDefault(); go('home'); }}><Icon name="arrowLeft" size={18} />Home</a>
    <h1 id="card-heading" className="visually-hidden">My reward card</h1>
    <div className="big-card">
      <div className="big-card-bar"><span className="brand-name">Grandma’s Bakeria</span><span className="brand-tag">Reward card{first ? ` · ${first}` : ''}</span></div>
      <Scallop size={18} />
      <StampGrid stamps={stamps} target={target} size="big" />
      <p className="big-card-caption ui-hand">{target} stamps = 1 parfait, on the house</p>
    </div>
    <div className="card-progress">
      <div className="card-bar" role="progressbar" aria-label="Stamps collected" aria-valuemin={0} aria-valuemax={target} aria-valuenow={stamps}>
        {Array.from({ length: target }, (_, index) => <span key={index} className={index < stamps ? 'on' : undefined} />)}
      </div>
      <span className="card-count ui-display">{stamps}/{target}</span>
    </div>
    <p className={`card-status ui-hand${full ? ' card-status-full' : ''}`} role="status">
      {full ? <>a full card! ask Grandma<br />to redeem your parfait.</> : <>complete a card to get<br />a free parfait!</>}
    </p>
    <p className="card-hint">Grandma adds a stamp when you stop by, and redeems a full card at the counter.</p>
  </section>;
}

interface OrderRow { id: string; sortKey: string; when: string; title: string; note: string; total: number; kind: TreatKind; items: OrderItem[]; status: 'scheduled' | 'overdue' | 'collected' | 'cancelled' | 'history'; }

function OrdersScreen({ hub, history, menuById, onOrder, go }: { hub: HubResponse; history: CustomerDetailResponse | null; menuById: Map<string, MenuItem>; onOrder: (items: OrderItem[]) => void; go: (view: View) => void }) {
  const preorderIds = new Set(hub.preorders.map(order => order.id));
  const rows: OrderRow[] = [
    ...hub.preorders.map((order): OrderRow => ({
      id: order.id, sortKey: order.pickup_at, when: pickupFormat.format(new Date(order.pickup_at)), title: summarize(order.items, menuById),
      note: order.note || (order.status === 'scheduled' ? 'pay at pickup' : order.status), total: order.total_cents, kind: kindOf(order.items, menuById), items: order.items,
      status: order.status === 'scheduled' ? (order.pickup_at < hub.as_of ? 'overdue' : 'scheduled') : order.status,
    })),
    ...(history?.orders ?? []).filter(order => !preorderIds.has(order.id)).map((order): OrderRow => ({
      id: order.id, sortKey: order.created_at, when: dateShort(order.created_at), title: summarize(order.items, menuById), note: 'in store',
      total: order.total_cents, kind: kindOf(order.items, menuById), items: order.items, status: 'history',
    })),
  ];
  const upcoming = rows.filter(row => row.status === 'scheduled' || row.status === 'overdue').sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const past = rows.filter(row => row.status !== 'scheduled' && row.status !== 'overdue').sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  const tilts = [-0.6, 0.5, -0.4, 0.6, -0.5];
  const card = (row: OrderRow, index: number) => <article className={`order-row order-${row.status}`} key={row.id} style={{ transform: `rotate(${tilts[index % tilts.length]}deg)` }}>
    <div className="order-art"><Treat kind={row.kind} size={100} /></div>
    <div className="order-body">
      <span className="ui-eyebrow order-when">{row.when}{row.status === 'scheduled' ? ' · scheduled' : row.status === 'overdue' ? ' · awaiting pickup' : row.status === 'cancelled' ? ' · cancelled' : ''}</span>
      <span className="order-title ui-display">{row.title}</span>
      <span className="order-note ui-hand">{row.note}</span>
    </div>
    <div className="order-side">
      <span className="order-total ui-display">{money(row.total)}</span>
      {(row.status === 'history' || row.status === 'collected') && <button type="button" className="ui-pill order-reorder" onClick={() => onOrder(row.items)}><Icon name="refresh" size={18} />Reorder</button>}
    </div>
  </article>;
  return <section className="orders-screen" aria-labelledby="orders-heading">
    <a href="/hub" className="back-link" onClick={event => { event.preventDefault(); go('home'); }}><Icon name="arrowLeft" size={18} />Home</a>
    <h1 id="orders-heading" className="orders-title">Recent orders</h1>
    {upcoming.length > 0 && <><h2 className="orders-sub"><Tag>Coming up</Tag></h2><div className="orders-list">{upcoming.map(card)}</div></>}
    {upcoming.length > 0 && past.length > 0 && <h2 className="orders-sub"><Tag>Past</Tag></h2>}
    {past.length > 0 && <div className="orders-list">{past.map(card)}</div>}
    {rows.length === 0 && <p className="orders-empty ui-hand">{history ? <>nothing here yet.<br />your first order will land right here.</> : 'gathering your orders…'}</p>}
  </section>;
}

function OffersDialog({ offers, treat, busy, onRedeem, onClose }: { offers: Offer[]; treat: TreatKind; busy: string | null; onRedeem: (id: string) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  const active = offers.filter(offer => offer.status === 'approved');
  const used = offers.filter(offer => offer.status === 'redeemed');
  return <div className="offers-backdrop" onClick={onClose}>
    <div className="offers-dialog" role="dialog" aria-modal="true" aria-labelledby="offers-title" onClick={event => event.stopPropagation()}>
      <div className="offers-bar">
        <h2 id="offers-title">Offers!</h2>
        <button ref={closeRef} type="button" className="brand-icon-button" aria-label="Close offers" onClick={onClose}><Icon name="close" size={24} strokeWidth={2.8} /></button>
      </div>
      <Scallop size={18} />
      <div className="offers-body">
        {offers.length === 0 && <p className="offers-empty ui-hand">nothing new just yet.<br />when Grandma shares a treat, it lands here.</p>}
        <div className="offers-grid">{active.map(offer => <OfferCard key={offer.id} offer={offer} treat={treat} busy={busy} onRedeem={onRedeem} />)}</div>
        {used.length > 0 && <details className="offers-used"><summary>Used offers ({used.length})</summary>
          <div className="offers-grid">{used.map(offer => <OfferCard key={offer.id} offer={offer} treat={treat} busy={busy} onRedeem={onRedeem} />)}</div>
        </details>}
      </div>
    </div>
  </div>;
}

function OfferCard({ offer, treat, busy, onRedeem }: { offer: Offer; treat: TreatKind; busy: string | null; onRedeem: (id: string) => void }) {
  const used = offer.status === 'redeemed';
  return <article className={`offer-card${used ? ' offer-used' : ''}`}>
    <div className="offer-art" aria-hidden="true"><Treat kind={treat} size={140} /></div>
    <p className="offer-message">{offer.message}</p>
    <p className="offer-sale ui-display">{used ? 'USED' : 'FREE TOPPING!'}</p>
    <p className="offer-sign ui-hand"><Icon name="heart" size={16} fill="#F2A7B5" />with love, Grandma</p>
    {!used && <button type="button" className="ui-pill" disabled={busy !== null} onClick={() => onRedeem(offer.id)}>{busy === `offer:${offer.id}` ? 'Redeeming…' : 'Redeem at the counter'}</button>}
    <p className="offer-fine">{used ? 'Marked used in the demo.' : 'Show Grandma. Demo redemption: nothing is charged.'}</p>
  </article>;
}
