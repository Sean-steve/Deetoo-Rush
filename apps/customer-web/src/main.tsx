import '../../../src/global-polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CustomerApp } from '../../customer/src/CustomerApp';
import { PublicSite } from '../../customer/src/PublicSite';
import '../../../src/index.css';
import '../../customer/src/customer-redesign.css';
import { installTheme } from '../../../packages/ui/src/theme';

installTheme(document.documentElement);

function CustomerWebRoot(){
  const path=window.location.pathname.replace(/\/+$/, '') || '/';
  const isCustomer=path==='/customer'||path.startsWith('/customer/');
  return isCustomer?<CustomerApp/>:<PublicSite path={path}/>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><CustomerWebRoot /></StrictMode>);
