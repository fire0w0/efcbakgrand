import { useEffect, useMemo, useState } from 'react';
import type { CustomerListQuery, CustomerListResponse, CustomerSummary } from '../shared/contracts';
import { client } from './client';
import { errorMessage, formatCents, formatDate, pluralDays, roundDays } from './format';
import { href, navigate } from './nav';
import MetricsCards from './MetricsCards';

type SortKey = NonNullable<CustomerListQuery['sort']>;
type Direction = NonNullable<CustomerListQuery['direction']>;

// Column keys match the contracted query names exactly; the server owns ordering and null placement.
const COLUMNS: { key: SortKey; label: string; defaultDirection: Direction; numeric?: boolean }[] = [
  { key: 'name', label: 'Name', defaultDirection: 'asc' },
  { key: 'visits', label: 'Visits', defaultDirection: 'desc', numeric: true },
  { key: 'favorite_item', label: 'Favorite', defaultDirection: 'asc' },
  { key: 'last_visit', label: 'Last visit', defaultDirection: 'desc' },
  { key: 'total_spend_cents', label: 'Total spend', defaultDirection: 'desc', numeric: true },
];

export default function CustomerList() {
  const [sort, setSort] = useState<SortKey>('name');
  const [direction, setDirection] = useState<Direction>('asc');
  const [lapsedOnly, setLapsedOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const query: CustomerListQuery = { sort, direction, ...(lapsedOnly ? { lapsed: 'true' as const } : {}) };
    client.customers(query)
      .then(response => { if (!cancelled) { setData(response); setError(''); } })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sort, direction, lapsedOnly, reload]);

  // Contract has no search parameter; the 50-row list is filtered locally.
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = data?.customers ?? [];
    return needle ? rows.filter(c => c.name.toLowerCase().includes(needle)) : rows;
  }, [data, search]);

  function toggleSort(column: typeof COLUMNS[number]) {
    if (sort === column.key) setDirection(d => d === 'asc' ? 'desc' : 'asc');
    else { setSort(column.key); setDirection(column.defaultDirection); }
  }

  return <section aria-labelledby="dashboard-list-heading">
    <h1 id="dashboard-list-heading">Your regulars</h1>
    <MetricsCards />
    <FavoriteSummary customers={data?.customers ?? null} lapsedOnly={lapsedOnly} />

    <div className="dashboard-toolbar">
      <label className="dashboard-search">
        <span>Search by name</span>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Maya…" autoComplete="off" />
      </label>
      <label className="dashboard-check">
        <input type="checkbox" checked={lapsedOnly} onChange={e => setLapsedOnly(e.target.checked)} />
        <span>Drifting away only</span>
      </label>
      {data && <p className="dashboard-muted dashboard-asof">As of {formatDate(data.as_of)} (demo clock)</p>}
    </div>

    {error && <p className="dashboard-error" role="alert">
      Couldn’t load regulars: {error} <button type="button" onClick={() => setReload(n => n + 1)}>Retry</button>
    </p>}
    {loading && !data && <p className="dashboard-muted" role="status">Loading regulars…</p>}

    {data && <div className="dashboard-table-wrap">
      <table className="dashboard-table" aria-busy={loading}>
        <thead>
          <tr>
            {COLUMNS.map(column => <th key={column.key} scope="col"
              className={column.numeric ? 'dashboard-num' : undefined}
              aria-sort={sort === column.key ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" className="dashboard-sort" onClick={() => toggleSort(column)}>
                {column.label}
                <span className="dashboard-sort-mark" aria-hidden="true">{sort === column.key ? (direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
              </button>
            </th>)}
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(customer => <CustomerRow key={customer.id} customer={customer} />)}
        </tbody>
      </table>
      {filtered.length === 0 && <p className="dashboard-empty">
        {data.customers.length === 0
          ? (lapsedOnly ? 'Nobody is drifting away right now.' : 'No customers yet.')
          : `No one named “${search.trim()}” in this list.`}
      </p>}
      <p className="dashboard-muted">Showing {filtered.length} of {data.customers.length}{lapsedOnly ? ' drifting regulars' : ' customers'}.</p>
    </div>}
  </section>;
}

function CustomerRow({ customer }: { customer: CustomerSummary }) {
  const days = roundDays(customer.days_since_last_visit);
  const gap = roundDays(customer.usual_gap_days);
  const path = `/grandma/${encodeURIComponent(customer.id)}`;
  return <tr className={customer.is_lapsed ? 'dashboard-row-lapsed' : undefined}>
    <th scope="row"><a href={href(path)} onClick={e => navigate(e, path)}>{customer.name}</a></th>
    <td className="dashboard-num">{customer.visits}</td>
    <td>{customer.favorite_item ? customer.favorite_item.name : <span className="dashboard-muted">No orders yet</span>}</td>
    <td>{formatDate(customer.last_visit)}{days !== null && <span className="dashboard-muted"> · {pluralDays(days)} ago</span>}</td>
    <td className="dashboard-num">{formatCents(customer.total_spend_cents)}</td>
    <td>
      {customer.is_lapsed
        ? <><span className="dashboard-badge dashboard-badge-lapsed">Drifting away</span>
          {gap !== null && <span className="dashboard-muted dashboard-small"> usually every {pluralDays(gap)}</span>}</>
        : customer.visits >= 3 ? <span className="dashboard-badge">Regular</span>
        : customer.visits > 0 ? <span className="dashboard-badge dashboard-badge-quiet">Occasional</span>
        : <span className="dashboard-badge dashboard-badge-quiet">New</span>}
    </td>
  </tr>;
}

// Stretch: favorite-item summary from existing records only. No new shapes, no new API.
function FavoriteSummary({ customers, lapsedOnly }: { customers: CustomerSummary[] | null; lapsedOnly: boolean }) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers ?? []) if (c.favorite_item) map.set(c.favorite_item.name, (map.get(c.favorite_item.name) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [customers]);
  if (counts.length === 0) return null;
  return <p className="dashboard-favorites">
    <span className="dashboard-favorites-label">Favorites among {lapsedOnly ? 'drifting regulars' : 'listed customers'}:</span>
    {counts.map(([name, count]) => <span key={name} className="dashboard-chip">{name} <strong>{count}</strong></span>)}
  </p>;
}
