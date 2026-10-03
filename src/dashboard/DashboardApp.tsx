import { BrandHeader, Icon } from '../shared/brand';
import { isMockMode } from './client';
import CustomerDetail from './CustomerDetail';
import CustomerList from './CustomerList';
import OrdersView from './OrdersView';
import { href, navigate, usePath } from './nav';
import './dashboard.css';

// Default, no-props export: the frozen shared mount renders this at /grandma and /grandma/:id.
export default function DashboardApp() {
  const path = usePath();
  const isOrders = /^\/grandma\/orders\/?$/.test(path);
  const match = !isOrders && path.match(/^\/grandma\/([^/]+)\/?$/);
  const customerId = match ? decodeURIComponent(match[1]) : null;

  return <div className="dashboard-shell">
    <BrandHeader homeHref={href('/grandma')} onHome={e => navigate(e, '/grandma')} subtitle="Grandma’s dashboard">
      <a href={href('/grandma')} onClick={e => navigate(e, '/grandma')} aria-current={!isOrders ? 'page' : undefined}><Icon name="user" size={20} /><span className="brand-nav-label">Regulars</span></a>
      <a href={href('/grandma/orders')} onClick={e => navigate(e, '/grandma/orders')} aria-current={isOrders ? 'page' : undefined}><Icon name="receipt" size={20} /><span className="brand-nav-label">Orders</span></a>
      <a href="/hub" target="_blank" rel="noopener noreferrer"><Icon name="external" size={20} /><span className="brand-nav-label">Customer hub</span></a>
    </BrandHeader>
    <main className="dashboard">
      {isMockMode && <p className="dashboard-mock" role="status">
        <strong>Mock mode (?mock=1).</strong> Stamps and offers are simulated in this tab only and never reach the server. Remove the flag for the real API.
      </p>}
      {isOrders ? <OrdersView /> : customerId ? <CustomerDetail key={customerId} id={customerId} /> : <CustomerList />}
    </main>
  </div>;
}
