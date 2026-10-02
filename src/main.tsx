import { createRoot } from 'react-dom/client';
import DashboardApp from './dashboard/DashboardApp';
import CustomerApp from './customer/CustomerApp';
import './styles.css';

const path = window.location.pathname;
createRoot(document.getElementById('root')!).render(
  path === '/grandma' || path.startsWith('/grandma/')
    ? <DashboardApp />
    : <CustomerApp />,
);
