import '../../../src/global-polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectedCustomerShopping } from '../../customer-web-next/src/integration/ConnectedCustomerShopping';
import { PublicSite } from '../../customer/src/PublicSite';
import '../../../src/index.css';
// Use the approved 15-screen customer system for the ONLY customer-facing route.
// Import after the public-site base styles so the approved surfaces retain priority.
import '../../customer-web-next/src/integration/foundation.css';
import '../../customer-web-next/src/integration/live-shopping.css';
import '../../customer-web-next/src/integration/live-orders.css';
import '../../customer-web-next/src/integration/live-account-support.css';
import '../../customer-web-next/src/styles.css';
import '../../customer-web-next/src/shopping.css';
import '../../customer-web-next/src/orders.css';
import '../../customer-web-next/src/account.css';
import '../../customer-web-next/src/support.css';
import { installTheme } from '../../../packages/ui/src/theme';

installTheme(document.documentElement);

function CustomerWebRoot() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isCustomer = path === '/customer' || path.startsWith('/customer/');
  return isCustomer ? <ConnectedCustomerShopping /> : <PublicSite path={path} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><CustomerWebRoot /></StrictMode>);
