import { useEffect, useState } from 'react';
import type { MetricsResponse } from '../shared/contracts';
import { client } from './client';
import { errorMessage, formatCents, formatPercent } from './format';

// Core metrics from GET /metrics. Null dollar figures are hidden, never shown as $0.
export default function MetricsCards() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError('');
    client.metrics()
      .then(m => { if (!cancelled) setMetrics(m); })
      .catch(e => { if (!cancelled) setError(errorMessage(e)); });
    return () => { cancelled = true; };
  }, [reload]);

  if (error) {
    return <p className="dashboard-error" role="alert">
      Couldn’t load metrics: {error} <button type="button" onClick={() => setReload(n => n + 1)}>Retry</button>
    </p>;
  }
  if (!metrics) return <p className="dashboard-muted">Loading metrics…</p>;

  return <section className="dashboard-metrics" aria-label="Core metrics">
    <Card label="Returning-customer rate" value={formatPercent(metrics.returning_customer_rate)} hint="Two or more visits in the last 90 days" />
    <Card label="Drifting regulars" value={String(metrics.lapsed_regulars)} hint="Away longer than twice their usual gap" />
    <Card label="Offers approved" value={String(metrics.offers_approved)} hint="Previewed in the customer hub, not sent" />
    <Card label="Offers redeemed" value={String(metrics.offers_redeemed)} hint="Simulated redemptions" />
    {metrics.revenue_at_risk_cents !== null && <Card
      label="Estimated monthly revenue at risk (CAD)"
      value={formatCents(metrics.revenue_at_risk_cents)}
      hint="Estimate from drifting regulars’ recent spend. Historical exposure, not recovered revenue."
      wide
    />}
    {metrics.revenue_recovered_cents !== null && <Card
      label="Revenue recovered (CAD)"
      value={formatCents(metrics.revenue_recovered_cents)}
      hint="Only shown when the server has attributable sales"
      wide
    />}
  </section>;
}

function Card({ label, value, hint, wide }: { label: string; value: string; hint: string; wide?: boolean }) {
  return <div className={`dashboard-card${wide ? ' dashboard-card-wide' : ''}`}>
    <p className="dashboard-card-label">{label}</p>
    <p className="dashboard-card-value">{value}</p>
    <p className="dashboard-card-hint">{hint}</p>
  </div>;
}
