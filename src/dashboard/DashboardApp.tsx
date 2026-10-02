import { isMockMode } from './client';
import CustomerDetail from './CustomerDetail';
import CustomerList from './CustomerList';
import { href, navigate, usePath } from './nav';
import './dashboard.css';

// Default, no-props export: the frozen shared mount renders this at /grandma and /grandma/:id.
export default function DashboardApp() {
  const path = usePath();
  const match = path.match(/^\/grandma\/([^/]+)\/?$/);
  const customerId = match ? decodeURIComponent(match[1]) : null;

  return <main className="dashboard">
    <header className="dashboard-top">
      <p className="dashboard-brand"><a href={href('/grandma')} onClick={e => navigate(e, '/grandma')}>Bakeria Friends Forever</a> · Grandma’s dashboard</p>
      <nav aria-label="Dashboard">
        <a href="/hub" target="_blank" rel="noopener noreferrer">Customer hub ↗</a>
      </nav>
    </header>
    {isMockMode && <p className="dashboard-mock" role="status">
      <strong>Mock mode (?mock=1).</strong> Stamps and offers are simulated in this tab only and never reach the server. Remove the flag for the real API.
    </p>}
    {customerId ? <CustomerDetail key={customerId} id={customerId} /> : <CustomerList />}
  </main>;
}
