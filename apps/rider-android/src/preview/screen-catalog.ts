import type { RiderTab } from './phase1-model';

/** Single 24-screen route inventory for acceptance and backend-capability mapping. */
export type RiderScreenDefinition = {
  id: number;
  title: string;
  phase: 1 | 2 | 3 | 4;
  tab: RiderTab | null;
  implementation: string;
};
export const riderTabs: readonly RiderTab[] = ['Home', 'Deliveries', 'Earnings', 'Inbox', 'Profile'] as const;
export const riderScreenCatalog: readonly RiderScreenDefinition[] = [
  { id: 1, title: 'Login & Authentication', phase: 1, tab: null, implementation: 'RiderFrontendApp: login' },
  { id: 2, title: 'Rider Registration', phase: 1, tab: null, implementation: 'RiderFrontendApp: registration' },
  { id: 3, title: 'Document Verification', phase: 1, tab: null, implementation: 'RiderFrontendApp: documents' },
  { id: 4, title: 'Vehicle & Equipment Registration', phase: 1, tab: null, implementation: 'RiderFrontendApp: vehicle' },
  { id: 5, title: 'Onboarding Status', phase: 1, tab: null, implementation: 'RiderFrontendApp: status' },
  { id: 6, title: 'Rider Dashboard', phase: 1, tab: 'Home', implementation: 'RiderFrontendApp: dashboard' },
  { id: 7, title: 'Incoming Delivery Request', phase: 2, tab: 'Deliveries', implementation: 'Phase2DeliveryScreens: incoming' },
  { id: 8, title: 'Active Delivery Details', phase: 2, tab: 'Deliveries', implementation: 'Phase2DeliveryScreens: details' },
  { id: 9, title: 'Navigate to Merchant', phase: 2, tab: 'Deliveries', implementation: 'Phase2DeliveryScreens: merchantRoute' },
  { id: 10, title: 'Merchant Pickup Confirmation', phase: 2, tab: 'Deliveries', implementation: 'Phase2DeliveryScreens: pickup' },
  { id: 11, title: 'Navigate to Customer', phase: 2, tab: 'Deliveries', implementation: 'Phase2DeliveryScreens: customerRoute' },
  { id: 12, title: 'Customer Handover & Delivery Confirmation', phase: 2, tab: 'Deliveries', implementation: 'Phase2DeliveryScreens: handover' },
  { id: 13, title: 'Delivery Completion Summary', phase: 3, tab: 'Deliveries', implementation: 'Phase3Deliveries: DeliveryCompletionScreen' },
  { id: 14, title: 'Active Deliveries & Multiple Orders', phase: 3, tab: 'Deliveries', implementation: 'Phase3Deliveries: ActiveDeliveriesScreen' },
  { id: 15, title: 'Delivery History', phase: 3, tab: 'Deliveries', implementation: 'Phase3Deliveries: DeliveryHistoryScreen' },
  { id: 16, title: 'Earnings Dashboard', phase: 3, tab: 'Earnings', implementation: 'Phase3Finance: EarningsDashboard' },
  { id: 17, title: 'Rider Wallet & Cash Management', phase: 3, tab: 'Earnings', implementation: 'Phase3Finance: RiderWalletScreen' },
  { id: 18, title: 'Payouts & Transactions', phase: 3, tab: 'Earnings', implementation: 'Phase3Finance: PayoutsScreen' },
  { id: 19, title: 'Performance & Ratings', phase: 4, tab: 'Profile', implementation: 'Phase4Performance: RiderPerformanceScreen' },
  { id: 20, title: 'Notifications Center', phase: 4, tab: 'Inbox', implementation: 'Phase4Communication: NotificationsScreen' },
  { id: 21, title: 'Rider Support Center', phase: 4, tab: 'Inbox', implementation: 'Phase4Communication: SupportCenterScreen' },
  { id: 22, title: 'Support Conversation', phase: 4, tab: 'Inbox', implementation: 'Phase4Communication: SupportConversationScreen' },
  { id: 23, title: 'Safety & Incident Reporting', phase: 4, tab: 'Profile', implementation: 'Phase4Safety: RiderSafetyScreen' },
  { id: 24, title: 'Rider Profile & Settings', phase: 4, tab: 'Profile', implementation: 'Phase4Profile: RiderProfileScreen' },
] as const;
export function riderScreenById(id: number): RiderScreenDefinition | undefined {
  return riderScreenCatalog.find(screen => screen.id === id);
}
