import { useEffect, useState } from 'react';
import { api } from '../shared/api';
import type { ConfigResponse } from '../shared/contracts';
import './customer.css';

export default function CustomerApp() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<ConfigResponse>('/config').then(setConfig).catch(e => setError(e.message)); }, []);
  return <main className="customer">
    <p>Bakeria Friends Forever</p>
    <h1>There’s always a place for you.</h1>
    <p>Commit-0 starter. Dev 3 owns phone entry, stamps, and personal offers.</p>
    <p>Demo regular: Maya Patel · (519) 555-0125</p>
    {error && <p role="alert">{error}</p>}
    {config?.order_form_url
      ? <p><a href={config.order_form_url} target="_blank" rel="noopener noreferrer">Order ahead</a></p>
      : <p>Order-ahead link will be connected before the checkpoint.</p>}
    <a href="/grandma">Open Grandma’s dashboard</a>
  </main>;
}
