import { useEffect, useState } from 'react';
import { api } from '../shared/api';
import type { CustomerListResponse } from '../shared/contracts';
import './dashboard.css';

export default function DashboardApp() {
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<CustomerListResponse>('/customers').then(setData).catch(e => setError(e.message)); }, []);
  return <main className="dashboard">
    <p>Bakeria Friends Forever · Grandma</p>
    <h1>Your regulars</h1>
    <p>Commit-0 starter. Dev 2 owns this screen and customer details.</p>
    <a href="/hub">Open customer hub</a>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p>Loading regulars…</p>}
    <ul>{data?.customers.map(customer => <li key={customer.id}>
      {customer.name} · {customer.visits} visits{customer.is_lapsed ? ' · Drifting away' : ''}
    </li>)}</ul>
  </main>;
}
