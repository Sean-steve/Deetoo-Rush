import '../../../src/global-polyfill';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MerchantApp } from '../../merchant/src/MerchantApp';
import MerchantPrototype from './MerchantPrototype';
import '../../../src/index.css';
import { installTheme } from '../../../packages/ui/src/theme';
installTheme(document.documentElement);
createRoot(document.getElementById('root')!).render(<StrictMode>{new URLSearchParams(window.location.search).get("merchant-prototype") === "1" ? <MerchantPrototype /> : <MerchantApp />}</StrictMode>);
