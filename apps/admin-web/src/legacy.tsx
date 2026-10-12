/** Legacy Admin UI is retained strictly for explicit rollback (?admin-legacy=1). */
import '../../../src/global-polyfill';
import '../../../src/index.css';
import { installTheme } from '../../../packages/ui/src/theme';
import { AdminApp } from '../../admin/src/AdminApp';

installTheme(document.documentElement);
export const LegacyAdmin = AdminApp;
