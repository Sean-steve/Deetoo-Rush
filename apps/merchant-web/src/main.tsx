import '../../../src/global-polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MerchantApp } from '../../merchant/src/MerchantApp';
import '../../../src/index.css';
import { installTheme } from '../../../packages/ui/src/theme';
installTheme(document.documentElement);
createRoot(document.getElementById('root')!).render(<StrictMode><MerchantApp /></StrictMode>);
