import type { DeetooApiClient } from '@deetoo/api-client';
/**
 * Typed backend boundary for the approved 24-screen Rider Android frontend.
 * No fixture data, privileged admin routes, fake OTPs, client payout settlement
 * or implicit success fallbacks. All money is represented in KES minor units.
 */
export type Json = Record<string, unknown>;
export type RiderHistory = { delivery_id: string; order_id: string; order_number?: string | null; status: string; created_at: string; delivered_at?: string | null; earning?: { total_minor: number; base_minor: number; bonus_minor: number; distance_minor: number; waiting_minor: number; adjustments_minor: number; status: string } | null };
export type RiderIncident = { id: string; type: string; status: string; summary: string; details: string; location_text?: string | null; created_at: string; timeline?: Array<{action: string; created_at: string}> };
export type WithdrawalRequest = { id: string; amount_minor: number; currency: string; status: string; created_at: string; payout_id?: string | null; rejection_reason?: string | null };
export const enc = (id: string) => encodeURIComponent(id);
export const toKes = (minor: number | string | null | undefined): string => {
  if (minor === null || minor === undefined || minor === '') return 'KSh —';
  const n = Number(minor);
  return Number.isFinite(n) ? 'KSh ' + (n / 100).toLocaleString('en-KE', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 'KSh —';
};
export function parseWithdrawalKes(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const minor = Math.round(Number(value) * 100);
  return Number.isSafeInteger(minor) && minor >= 10000 && minor <= 100000000 ? minor : null;
}
export function parseRiderServerError(error: unknown): string {
  const e = error as { error?: { message?: string; code?: string }; message?: string };
  return e?.error?.message || e?.message || 'Could not complete this request. Check your connection and try again.';
}
export function safeRiderDeliveryAction(status: string, action: string): boolean {
  const expected: Record<string, string> = {
    arrivePickup: 'ASSIGNED',
    pickup: 'ARRIVED_PICKUP',
    startTrip: 'PICKED_UP',
    arriveDropoff: 'EN_ROUTE',
    complete: 'ARRIVED_DROPOFF',
    fail: 'ASSIGNED,ARRIVED_PICKUP,PICKED_UP,EN_ROUTE,ARRIVED_DROPOFF',
  };
  return !!expected[action]?.split(',').includes(status);
}
export function createRiderBackend(client: DeetooApiClient) {
  const get = async <T>(path: string): Promise<T> => (await client.request<T>(path)).data;
  const post = async <T>(path: string, body?: object): Promise<T> =>
    (await client.request<T>(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) })).data;
  const put = async <T>(path: string, body: object): Promise<T> =>
    (await client.request<T>(path, { method: 'PUT', body: JSON.stringify(body) })).data;
  const patch = async <T>(path: string, body: object): Promise<T> =>
    (await client.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })).data;

  return {
    status: () => get<any>('/rider/status'),
    profile: () => get<any>('/rider/profile'),
    updateBasicProfile: (data: { first_name?: string; last_name?: string; phone_e164?: string }) => patch<any>('/rider/profile', data),
    vehicles: () => get<any>('/rider/vehicles'),
    submitVehicle: (data: {type: 'MOTORBIKE'|'BICYCLE'|'CAR'; registration_number: string; status: 'INACTIVE'}) => post<any>('/rider/vehicles', data),
    submitOnboarding: () => post<any>('/rider/onboarding/submit'),
    requestPhoneVerification: (phone_e164: string) => post<any>('/auth/verify/otp-request', {phone_e164,purpose:'VERIFICATION'}),
    confirmPhoneVerification: (phone_e164: string, code: string) => post<any>('/auth/verify/otp-confirm', {phone_e164,code}),
    verification: () => get<any>('/rider/verification/checklist'),
    submitDocument: (mediaId: string, documentType: string, expiresOn?: string) => post<any>('/rider/verification/documents', { media_id: mediaId, document_type: documentType, ...(expiresOn ? {expires_on: expiresOn} : {}) }),
    submitEquipment: (data: { delivery_bag: boolean; reflective_vest: boolean; helmet: boolean }) => post<any>('/rider/verification/equipment', data),
    changeRequest: (category: 'PERSONAL'|'VEHICLE'|'PAYOUT_DESTINATION'|'ACCOUNT_DEACTIVATION'|'ACCOUNT_DELETION', description: string) => post<any>('/rider/profile/change-requests', { category, description }),
    availability: () => get<any>('/rider/availability'),
    location: (data: {latitude:number;longitude:number;accuracy_meters:number;recorded_at:string}) => post<any>('/rider/location', data),
    goOnline: (data: {latitude:number;longitude:number;accuracy_meters:number}) => post<any>('/rider/availability/online', data),
    goOffline: () => post<any>('/rider/availability/offline'),
    offer: () => get<any>('/rider/offers/active'),
    acceptOffer: (id: string) => post<any>('/rider/offers/'+enc(id)+'/accept'),
    declineOffer: (id: string) => post<any>('/rider/offers/'+enc(id)+'/reject', {reason_code:'RIDER_DECLINED',note:'Rider declined offer'}),
    activeDelivery: () => get<any>('/rider/deliveries/active'),
    delivery: (id: string) => get<any>('/rider/deliveries/'+enc(id)),
    arrivePickup: (id: string, loc: object) => post<any>('/rider/deliveries/'+enc(id)+'/arrive-pickup',loc),
    confirmPickup: (id: string, code: string) => post<any>('/rider/deliveries/'+enc(id)+'/confirm-pickup',{pickup_verification_code:code}),
    startTrip: (id: string) => post<any>('/rider/deliveries/'+enc(id)+'/start-trip'),
    arriveDropoff: (id: string, loc: object) => post<any>('/rider/deliveries/'+enc(id)+'/arrive-dropoff', loc),
    completeOtp: (id: string, otp: string) => post<any>('/rider/deliveries/'+enc(id)+'/complete',{proof_type:'OTP',otp}),
    completePhoto: (id: string, mediaId: string) => post<any>('/rider/deliveries/'+enc(id)+'/complete',{proof_type:'PHOTO',photo_media_id:mediaId}),
    reportFailedDelivery: (id: string, code: string, note: string) => post<any>('/rider/deliveries/'+enc(id)+'/fail',{reason_code:code,note}),
    capabilities: () => get<{multi_order:{enabled:boolean;max_active_deliveries:number;message:string}}>('/rider/deliveries/capabilities'),
    history: (status?: string, offset = 0) => get<{history:RiderHistory[];total:number;limit:number;offset:number}>('/rider/deliveries/history?limit=20&offset='+offset+(status ? '&status='+enc(status) : '')),
    historyDetail: (id: string) => get<RiderHistory>('/rider/deliveries/history/'+enc(id)),
    earnings: () => get<any>('/rider/earnings'),
    earningsTrends: (days: number) => get<{days:number;currency:string;series:Array<{date:string;total_minor:number;bonus_minor:number;adjustments_minor:number;deliveries:number}>;total_minor:number;deliveries:number}>('/rider/earnings/trends?days='+days),
    wallet: () => get<any>('/rider/wallet'),
    payouts: () => get<any>('/rider/payouts'),
    payoutRequests: () => get<{requests:WithdrawalRequest[]}>('/rider/payout-requests'),
    requestWithdrawal: (minor: number, key: string) => post<WithdrawalRequest>('/rider/payout-requests',{amount_minor:minor,idempotency_key:key}),
    performance: () => get<any>('/rider/performance'),
    feedback: (days = 30) => get<{feedback:Array<{rating:number;comment?:string;created_at:string}>}>('/rider/performance/feedback?days='+days),
    notifications: () => get<{notifications:Array<any>;total:number}>('/support/notifications'),
    markRead: (id: string) => post<any>('/support/notifications/'+enc(id)+'/read'),
    supportCases: () => get<any>('/support/cases'),
    supportCase: (id: string) => get<any>('/support/cases/'+enc(id)),
    createSupportCase: (data: {category:string;subject:string;description:string;order_id?:string}) => post<any>('/support/cases',data),
    sendSupportMessage: (id:string, body:string, mediaIds: string[] = []) => post<any>('/support/cases/'+enc(id)+'/messages',{body,media_ids:mediaIds}),
    respondSupport: (id:string, decision:'ACCEPTED'|'DISPUTED', comment:string) => post<any>('/support/cases/'+enc(id)+'/resolution-response',{decision,comment}),
    incidents: () => get<{incidents:RiderIncident[];total:number}>('/rider/incidents'),
    incident: (id:string) => get<RiderIncident>('/rider/incidents/'+enc(id)),
    createIncident: (body:{type:string;summary:string;details:string;location_text:string;delivery_id?:string}) => post<RiderIncident>('/rider/incidents',body),
    incidentEvidence: (id:string, mediaId:string,description:string) => post<any>('/rider/incidents/'+enc(id)+'/evidence',{media_id:mediaId,description}),
    preferences: () => get<any>('/rider/preferences'),
    updatePreferences: (body: {payouts:boolean;support:boolean;promotions:boolean;updates:boolean;sounds:boolean;vibration:boolean;language:'English'|'Kiswahili';map_style:'Standard'|'Satellite'}) => put<any>('/rider/preferences',body),
  };
}
export type RiderBackend = ReturnType<typeof createRiderBackend>;
