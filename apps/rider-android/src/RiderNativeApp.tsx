import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { AuthUser } from '@deetoo/types';
import { createRiderAndroidSession } from './index';
import { riderApiOrigin } from './config';
import { riderSecureStore } from './secure-store';
import {
  getFreshLocation,
  startRiderLocationService,
  stopRiderLocationService,
} from './background-location';
import { registerRiderPushDevice, subscribeToOfferNotifications } from './push';
import { uploadDeliveryPhoto } from './media';

function createRiderRequestId(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((value) => value.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function errorMessage(error: unknown): string {
  const value = error as any;
  return value?.error?.message || value?.message || 'Something went wrong';
}

async function assertRiderApiReachable(apiOrigin: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${apiOrigin}/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`DeeToo API health check returned HTTP ${response.status}`);
    }
  } catch (error: any) {
    const detail = String(error?.message || '');
    throw new Error(
      `Cannot reach DeeToo API at ${apiOrigin}. Open ${apiOrigin}/health in your phone browser. ` +
      `Make sure the API is listening on 0.0.0.0:3000 and the phone/laptop are on the same Wi-Fi. ` +
      (detail ? `Network detail: ${detail}` : ''),
    );
  } finally {
    clearTimeout(timer);
  }
}

function ActionButton({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        danger && styles.dangerButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function RiderNativeApp() {
  const apiOrigin = useMemo(() => riderApiOrigin(), []);
  const session = useMemo(
    () =>
      createRiderAndroidSession({
        apiBaseUrl: apiOrigin,
        secureStore: riderSecureStore,
        requestIdFactory: createRiderRequestId,
      }),
    [apiOrigin],
  );
  const client = session.client;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pushReady, setPushReady] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [offer, setOffer] = useState<any>(null);
  const [active, setActive] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [pickupCode, setPickupCode] = useState('');
  const [deliveryOtp, setDeliveryOtp] = useState('');
  const [incidentNote, setIncidentNote] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportCases, setSupportCases] = useState<any[]>([]);
  const [supportDetail, setSupportDetail] = useState<any>(null);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDescription, setSupportDescription] = useState('');
  const [supportReply, setSupportReply] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<any>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [riderStatus, activeOffer, activeDelivery, riderEarnings] = await Promise.all([
        client.request<any>('/rider/status'),
        client.request<any>('/rider/offers/active'),
        client.request<any>('/rider/deliveries/active'),
        client.request<any>('/rider/earnings'),
      ]);
      setStatus(riderStatus.data);
      setOffer(activeOffer.data);
      setActive(activeDelivery.data);
      setEarnings(riderEarnings.data);
      const deliveryId = activeDelivery.data?.delivery?.id;
      if (deliveryId) {
        const deliveryDetail = await client.request<any>(
          `/rider/deliveries/${encodeURIComponent(deliveryId)}`,
        );
        setDetail(deliveryDetail.data);
      } else {
        setDetail(null);
      }
      setMessage(null);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }, [client, user]);

  useEffect(() => {
    void (async () => {
      try {
        const restored = await session.restore();
        setUser(restored);
      } finally {
        setRestoring(false);
      }
    })();
  }, [session]);

  useEffect(() => {
    if (!user) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(timer);
  }, [user, refresh]);

  useEffect(() => {
    if (!user || !pushReady) return;
    return subscribeToOfferNotifications(() => {
      void refresh();
    });
  }, [pushReady, refresh, user]);

  useEffect(() => {
    if (status?.profile?.workStatus && status.profile.workStatus !== 'OFFLINE') {
      void startRiderLocationService().catch((error) =>
        setMessage(errorMessage(error)),
      );
    }
  }, [status?.profile?.workStatus]);

  async function enablePushNotifications() {
    if (pushReady) return;
    try {
      await registerRiderPushDevice(client);
      setPushReady(true);
    } catch (error) {
      setMessage(`Push setup: ${errorMessage(error)}`);
    }
  }

  async function perform(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
      await refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    await perform(async () => {
      await assertRiderApiReachable(apiOrigin);
      const authenticated = await session.login(identifier.trim(), password);
      if (!authenticated.roles?.map(String).some((role) => role.toLowerCase() === 'rider')) {
        await session.logout();
        throw new Error('This account is not a Rider account.');
      }
      setUser(authenticated);
    });
  }

  async function logout() {
    setBusy(true);
    try {
      await stopRiderLocationService().catch(() => undefined);
      await session.logout();
      setUser(null);
      setStatus(null);
      setOffer(null);
      setActive(null);
      setDetail(null);
      setEarnings(null);
      setSupportCases([]);
      setSupportDetail(null);
      setSupportOpen(false);
      setPushReady(false);
    } finally {
      setBusy(false);
    }
  }

  async function goOnline() {
    const location = await getFreshLocation();
    await client.request('/rider/location', {
      method: 'POST',
      body: JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy_meters: location.coords.accuracy || 0,
        recorded_at: new Date(location.timestamp).toISOString(),
      }),
    });
    await client.request('/rider/availability/online', {
      method: 'POST',
      body: JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy_meters: location.coords.accuracy || 0,
      }),
    });
    await startRiderLocationService();
    void enablePushNotifications();
  }

  async function goOffline() {
    await client.request('/rider/availability/offline', { method: 'POST' });
    await stopRiderLocationService();
  }

  async function loadSupportCases() {
    const response = await client.request<any>('/support/cases');
    setSupportCases(response.data?.cases || []);
  }

  async function openSupportCase(caseId: string) {
    const response = await client.request<any>(
      `/support/cases/${encodeURIComponent(caseId)}`,
    );
    setSupportDetail(response.data);
    setSupportOpen(true);
  }

  async function createSupportCase() {
    await perform(async () => {
      const created = await client.request<any>('/support/cases', {
        method: 'POST',
        body: JSON.stringify({
          subject: supportSubject.trim(),
          description: supportDescription.trim(),
          category: 'RIDER_SUPPORT',
          order_id: active?.delivery?.order_id || undefined,
          delivery_id: active?.delivery?.id || undefined,
        }),
      });
      setSupportSubject('');
      setSupportDescription('');
      await loadSupportCases();
      if (created.data?.id) await openSupportCase(created.data.id);
    }, 'Support case opened.');
  }

  async function sendSupportReply() {
    const caseId = supportDetail?.case?.id;
    if (!caseId || !supportReply.trim()) return;
    await perform(async () => {
      await client.request(
        `/support/cases/${encodeURIComponent(caseId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ body: supportReply.trim() }),
        },
      );
      setSupportReply('');
      await openSupportCase(caseId);
    }, 'Support reply sent.');
  }

  async function respondToSupportResolution(decision: 'ACCEPTED' | 'DISPUTED') {
    const caseId = supportDetail?.case?.id;
    if (!caseId) return;
    await perform(async () => {
      await client.request(
        `/support/cases/${encodeURIComponent(caseId)}/resolution-response`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision,
            comment:
              decision === 'DISPUTED'
                ? supportReply.trim() || 'I still need help with this case.'
                : undefined,
          }),
        },
      );
      setSupportReply('');
      await openSupportCase(caseId);
      await loadSupportCases();
    }, decision === 'ACCEPTED' ? 'Resolution accepted.' : 'Case returned to Support.');
  }

  async function withFreshLocation(endpoint: string) {
    const location = await getFreshLocation();
    return client.request(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy_meters: location.coords.accuracy || 0,
      }),
    });
  }

  async function capturePhotoProof() {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) throw new Error('Camera permission is required for photo proof.');
    }
    setCameraOpen(true);
  }

  async function takeAndSubmitPhoto() {
    const deliveryId = active?.delivery?.id;
    if (!deliveryId || !cameraRef.current) return;
    await perform(async () => {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });
      if (!photo?.uri) throw new Error('Camera did not return a proof photo.');
      const mediaId = await uploadDeliveryPhoto(client, deliveryId, photo.uri);
      await client.request(`/rider/deliveries/${encodeURIComponent(deliveryId)}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          proof_type: 'PHOTO',
          photo_media_id: mediaId,
        }),
      });
      setCameraOpen(false);
    }, 'Delivery completed with private photo proof.');
  }

  if (restoring) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text>Restoring secure Rider session…</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginCard}>
          <Text style={styles.loginBrand}>DeeToo Rider</Text>
          <Text style={styles.muted}>Sign in with your approved Rider account.</Text>
          <Text style={styles.muted}>API: {apiOrigin}</Text>
          <TextInput
            autoCapitalize="none"
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="Email or phone"
            style={styles.input}
          />
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            style={styles.input}
          />
          {message && <Text style={styles.error}>{message}</Text>}
          <ActionButton label={busy ? 'Signing in…' : 'Sign in'} disabled={busy} onPress={() => void login()} />
        </View>
      </SafeAreaView>
    );
  }

  if (cameraOpen) {
    return (
      <SafeAreaView style={styles.container}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
        <View style={styles.cameraActions}>
          <ActionButton label="Cancel" disabled={busy} danger onPress={() => setCameraOpen(false)} />
          <ActionButton label={busy ? 'Submitting…' : 'Take proof photo'} disabled={busy} onPress={() => void takeAndSubmitPhoto()} />
        </View>
      </SafeAreaView>
    );
  }

  const workStatus = status?.profile?.workStatus || 'UNKNOWN';
  const delivery = active?.delivery;
  const deliveryStatus = delivery?.status;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.riderHero}>
          <View style={styles.header}>
            <View>
              <Text style={styles.heroEyebrow}>DEETOO RIDER</Text>
              <Text style={styles.brand}>Ready for the road.</Text>
              <Text style={styles.heroMuted}>{user.email || user.phone_e164 || user.id}</Text>
            </View>
            <Pressable onPress={() => void logout()} disabled={busy} style={styles.signOutPill}>
              <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
          </View>
          <View style={styles.heroStatusRow}>
            <View style={styles.heroStatus}>
              <Text style={styles.heroStatusLabel}>WORK STATUS</Text>
              <Text style={styles.heroStatusValue}>{workStatus.replaceAll('_',' ')}</Text>
            </View>
            <View style={styles.heroStatus}>
              <Text style={styles.heroStatusLabel}>GPS</Text>
              <Text style={styles.heroStatusValue}>{status?.locationFreshness?.isStale ? 'Needs update' : 'Fresh'}</Text>
            </View>
            <View style={styles.heroStatus}>
              <Text style={styles.heroStatusLabel}>PUSH</Text>
              <Text style={styles.heroStatusValue}>{pushReady ? 'Ready' : 'Optional'}</Text>
            </View>
          </View>
          {workStatus === 'OFFLINE' ? (
            <ActionButton label={busy ? 'Starting…' : 'Go online & receive offers'} disabled={busy} onPress={() => void perform(goOnline, 'You are online.')} />
          ) : (
            <ActionButton label={busy ? 'Stopping…' : workStatus === 'BUSY' ? 'Delivery in progress' : 'Go offline'} disabled={busy || workStatus === 'BUSY'} danger={workStatus!=='BUSY'} onPress={() => void perform(goOffline, 'You are offline.')} />
          )}
          {!pushReady && (
            <ActionButton
              label="Enable delivery notifications"
              disabled={busy}
              onPress={() => void enablePushNotifications()}
            />
          )}
        </View>

        {message && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{message}</Text>
          </View>
        )}

        {offer && (
          <View style={styles.offerCard}>
            <Text style={styles.sectionTitle}>New delivery offer</Text>
            <Text style={styles.bigText}>{offer.restaurantName}</Text>
            <Text>{offer.pickupAddress}</Text>
            <Text style={styles.muted}>Drop-off: {offer.dropoffAddress}</Text>
            <Text style={styles.money}>
              Expected earning: KES {((offer.estimatedEarningsMinor || 0) / 100).toFixed(2)}
            </Text>
            <Text>{offer.secondsRemaining}s remaining</Text>
            <ActionButton
              label="Accept delivery"
              disabled={busy}
              onPress={() =>
                void perform(
                  () => client.request(`/rider/offers/${encodeURIComponent(offer.offer.id)}/accept`, { method: 'POST' }),
                  'Delivery accepted.',
                )
              }
            />
            <ActionButton
              label="Reject"
              danger
              disabled={busy}
              onPress={() =>
                void perform(() =>
                  client.request(`/rider/offers/${encodeURIComponent(offer.offer.id)}/reject`, {
                    method: 'POST',
                    body: JSON.stringify({ reason_code: 'RIDER_DECLINED', note: 'Rider declined in Android app' }),
                  }),
                )
              }
            />
          </View>
        )}

        {delivery && detail && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Active delivery</Text>
            <Text style={styles.status}>{deliveryStatus}</Text>
            <Text style={styles.bigText}>{detail.pickup?.name}</Text>
            <Text>{detail.pickup?.address}</Text>
            {detail.navigation?.pickupMapsUrl && ['ASSIGNED', 'ARRIVED_PICKUP'].includes(deliveryStatus) && (
              <Pressable onPress={() => void Linking.openURL(detail.navigation.pickupMapsUrl)}>
                <Text style={styles.link}>Open pickup navigation</Text>
              </Pressable>
            )}
            {detail.navigation?.dropoffMapsUrl && ['PICKED_UP', 'EN_ROUTE', 'ARRIVED_DROPOFF'].includes(deliveryStatus) && (
              <Pressable onPress={() => void Linking.openURL(detail.navigation.dropoffMapsUrl)}>
                <Text style={styles.link}>Open customer navigation</Text>
              </Pressable>
            )}

            {deliveryStatus === 'ASSIGNED' && (
              <ActionButton
                label="Arrived at restaurant"
                disabled={busy}
                onPress={() => void perform(() => withFreshLocation(`/rider/deliveries/${delivery.id}/arrive-pickup`))}
              />
            )}

            {deliveryStatus === 'ARRIVED_PICKUP' && (
              <>
                <TextInput
                  value={pickupCode}
                  onChangeText={setPickupCode}
                  autoCapitalize="characters"
                  placeholder="Pickup handover code"
                  style={styles.input}
                />
                <ActionButton
                  label="Confirm pickup"
                  disabled={busy || !pickupCode.trim()}
                  onPress={() =>
                    void perform(() =>
                      client.request(`/rider/deliveries/${delivery.id}/confirm-pickup`, {
                        method: 'POST',
                        body: JSON.stringify({ pickup_verification_code: pickupCode.trim() }),
                      }),
                    )
                  }
                />
              </>
            )}

            {deliveryStatus === 'PICKED_UP' && (
              <ActionButton
                label="Start delivery"
                disabled={busy}
                onPress={() =>
                  void perform(() =>
                    client.request(`/rider/deliveries/${delivery.id}/start-trip`, { method: 'POST' }),
                  )
                }
              />
            )}

            {deliveryStatus === 'EN_ROUTE' && (
              <ActionButton
                label="Arrived at customer"
                disabled={busy}
                onPress={() => void perform(() => withFreshLocation(`/rider/deliveries/${delivery.id}/arrive-dropoff`))}
              />
            )}

            {deliveryStatus === 'ARRIVED_DROPOFF' && (
              <>
                <TextInput
                  value={deliveryOtp}
                  onChangeText={setDeliveryOtp}
                  keyboardType="number-pad"
                  placeholder="Customer delivery OTP"
                  style={styles.input}
                />
                <ActionButton
                  label="Complete with OTP"
                  disabled={busy || deliveryOtp.trim().length < 4}
                  onPress={() =>
                    void perform(() =>
                      client.request(`/rider/deliveries/${delivery.id}/complete`, {
                        method: 'POST',
                        body: JSON.stringify({ proof_type: 'OTP', otp: deliveryOtp.trim() }),
                      }),
                    )
                  }
                />
                <ActionButton
                  label="Use private photo proof"
                  disabled={busy}
                  onPress={() => void capturePhotoProof().catch((error) => setMessage(errorMessage(error)))}
                />
              </>
            )}

            {['ASSIGNED', 'ARRIVED_PICKUP', 'PICKED_UP', 'EN_ROUTE', 'ARRIVED_DROPOFF'].includes(deliveryStatus) && (
              <View style={styles.incident}>
                <Text style={styles.sectionTitle}>Delivery problem</Text>
                <TextInput
                  value={incidentNote}
                  onChangeText={setIncidentNote}
                  placeholder="Describe what happened"
                  multiline
                  style={[styles.input, styles.textArea]}
                />
                <ActionButton
                  label="Report customer unreachable"
                  danger
                  disabled={busy || incidentNote.trim().length < 3}
                  onPress={() =>
                    Alert.alert(
                      'Report failed delivery?',
                      'After pickup, you remain responsible for the order until Operations resolves the incident.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Report',
                          style: 'destructive',
                          onPress: () =>
                            void perform(() =>
                              client.request(`/rider/deliveries/${delivery.id}/fail`, {
                                method: 'POST',
                                body: JSON.stringify({
                                  reason_code: 'CUSTOMER_UNREACHABLE',
                                  note: incidentNote.trim(),
                                }),
                              }),
                            ),
                        },
                      ],
                    )
                  }
                />
              </View>
            )}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Earnings</Text>
          <Text style={styles.money}>
            Eligible: {earnings?.currency || 'KES'} {((earnings?.eligible_minor || 0) / 100).toFixed(2)}
          </Text>
          <Text style={styles.muted}>
            Lifetime: {earnings?.currency || 'KES'} {((earnings?.lifetime_minor || 0) / 100).toFixed(2)}
          </Text>
          <Text style={styles.muted}>
            Completed earning records: {earnings?.earnings?.length || 0}
          </Text>
        </View>

        {!delivery && !offer && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Ready</Text>
            <Text style={styles.muted}>
              {workStatus === 'ONLINE_AVAILABLE'
                ? 'You are available for delivery offers.'
                : 'Go online with fresh GPS to receive delivery offers.'}
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Support</Text>
          <Text style={styles.muted}>
            Talk to DeeToo Support about an order, delivery, payment or Rider-account issue.
          </Text>
          <ActionButton
            label={supportOpen ? 'Hide support' : 'Open support'}
            disabled={busy}
            onPress={() => {
              const next = !supportOpen;
              setSupportOpen(next);
              if (next) void loadSupportCases().catch((error) => setMessage(errorMessage(error)));
            }}
          />

          {supportOpen && (
            <View style={styles.supportStack}>
              <Text style={styles.supportLabel}>Open a new case</Text>
              <TextInput
                value={supportSubject}
                onChangeText={setSupportSubject}
                placeholder="What do you need help with?"
                style={styles.input}
              />
              <TextInput
                value={supportDescription}
                onChangeText={setSupportDescription}
                placeholder="Describe what happened"
                multiline
                style={[styles.input, styles.textArea]}
              />
              <ActionButton
                label="Create support case"
                disabled={busy || supportSubject.trim().length < 3 || supportDescription.trim().length < 3}
                onPress={() => void createSupportCase()}
              />

              {supportCases.length > 0 && (
                <>
                  <Text style={styles.supportLabel}>Your conversations</Text>
                  {supportCases.slice(0, 8).map((supportCase: any) => (
                    <Pressable
                      key={supportCase.id}
                      style={styles.supportCaseButton}
                      onPress={() => void openSupportCase(supportCase.id)}
                    >
                      <Text style={styles.supportCaseTitle}>{supportCase.subject}</Text>
                      <Text style={styles.muted}>
                        {supportCase.case_number} · {supportCase.status}
                      </Text>
                    </Pressable>
                  ))}
                </>
              )}

              {supportDetail?.case && (
                <View style={styles.supportConversation}>
                  <Text style={styles.supportLabel}>
                    {supportDetail.case.subject}
                  </Text>
                  {(supportDetail.notes || []).map((note: any) => (
                    <View
                      key={note.id}
                      style={[
                        styles.supportMessage,
                        note.message_type === 'RESOLUTION' && styles.supportResolution,
                      ]}
                    >
                      <Text style={styles.supportMessageAuthor}>
                        {note.author_name || note.author_role || 'Support'}
                      </Text>
                      <Text style={styles.supportMessageBody}>{note.body}</Text>
                    </View>
                  ))}

                  {['RESOLUTION_PROPOSED', 'PARTY_CONFIRMATION'].includes(
                    supportDetail.case.status,
                  ) && (
                    <View style={styles.supportResolution}>
                      <Text style={styles.supportCaseTitle}>Proposed resolution</Text>
                      <Text style={styles.supportMessageBody}>
                        {supportDetail.case.resolution_notes ||
                          'Review the conversation and tell us whether this resolves your issue.'}
                      </Text>
                      <ActionButton
                        label="I am satisfied"
                        disabled={busy}
                        onPress={() => void respondToSupportResolution('ACCEPTED')}
                      />
                      <ActionButton
                        label="I still need help"
                        danger
                        disabled={busy}
                        onPress={() => void respondToSupportResolution('DISPUTED')}
                      />
                    </View>
                  )}

                  <TextInput
                    value={supportReply}
                    onChangeText={setSupportReply}
                    placeholder="Reply to Support"
                    multiline
                    style={[styles.input, styles.textArea]}
                  />
                  <ActionButton
                    label="Send reply"
                    disabled={busy || supportReply.trim().length < 1}
                    onPress={() => void sendSupportReply()}
                  />
                </View>
              )}
            </View>
          )}
        </View>

        <ActionButton label="Refresh" disabled={busy} onPress={() => void refresh()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F9F6' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F4F9F6' },
  content: { padding: 16, gap: 14, paddingBottom: 56 },
  loginCard: { margin: 20, marginTop: 100, padding: 24, gap: 14, backgroundColor: '#FFFFFF', borderRadius: 26, borderWidth: 1, borderColor: '#E0EBE4' },
  riderHero: { backgroundColor: '#0B1E15', borderRadius: 28, padding: 20, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heroEyebrow: { color: '#66F0A6', fontSize: 10, fontWeight: '900', letterSpacing: 1.6, marginBottom: 5 },
  brand: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1.1 },
  loginBrand: { fontSize: 30, lineHeight: 34, fontWeight: '900', color: '#10231A', letterSpacing: -1.1 },
  heroMuted: { color: '#9DB2A6', marginTop: 5, fontSize: 12 },
  signOutPill: { paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#173126', borderRadius: 14 },
  signOutText: { color: '#D7E8DE', fontSize: 11, fontWeight: '800' },
  heroStatusRow: { flexDirection: 'row', gap: 10 },
  heroStatus: { flex: 1, backgroundColor: '#112B1E', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#1F4432' },
  heroStatusLabel: { color: '#789183', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  heroStatusValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 5 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: '#10231A', letterSpacing: -0.4 },
  bigText: { fontSize: 22, fontWeight: '900', color: '#10231A', letterSpacing: -0.5 },
  status: { fontSize: 13, fontWeight: '900', color: '#00BF62', marginVertical: 6, textTransform: 'uppercase', letterSpacing: 0.7 },
  muted: { color: '#66786E', marginTop: 4, fontSize: 13, lineHeight: 19 },
  money: { fontWeight: '900', marginVertical: 8, color: '#10231A', fontSize: 18 },
  link: { color: '#007C43', fontWeight: '900', paddingVertical: 8 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, gap: 10, borderWidth: 1, borderColor: '#E2ECE6' },
  offerCard: { backgroundColor: '#E8FFF2', borderColor: '#00BF62', borderWidth: 1.5, borderRadius: 26, padding: 18, gap: 10 },
  notice: { padding: 13, backgroundColor: '#FFF6DA', borderRadius: 16, borderWidth: 1, borderColor: '#F5DC8B' },
  noticeText: { color: '#654A00', fontWeight: '700' },
  incident: { marginTop: 10, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#DCE7E0', gap: 8 },
  supportStack: { gap: 10, marginTop: 8 },
  supportLabel: { fontSize: 13, fontWeight: '900', color: '#30483B', marginTop: 6 },
  supportCaseButton: { borderWidth: 1, borderColor: '#DCE7E0', borderRadius: 15, padding: 12, backgroundColor: '#F8FBF9' },
  supportCaseTitle: { fontSize: 14, fontWeight: '900', color: '#10231A' },
  supportConversation: { gap: 9, paddingTop: 8 },
  supportMessage: { borderWidth: 1, borderColor: '#E2ECE6', borderRadius: 15, padding: 12, backgroundColor: '#F8FBF9' },
  supportResolution: { borderWidth: 1, borderColor: '#A8E8C5', borderRadius: 15, padding: 12, backgroundColor: '#EDFFF4', gap: 8 },
  supportMessageAuthor: { fontSize: 10, fontWeight: '900', color: '#66786E', marginBottom: 4 },
  supportMessageBody: { fontSize: 13, lineHeight: 19, color: '#30483B' },
  input: { backgroundColor: '#F8FBF9', borderColor: '#D7E4DB', borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#10231A' },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  button: { backgroundColor: '#00BF62', borderRadius: 15, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  dangerButton: { backgroundColor: '#B42318' },
  disabledButton: { opacity: 0.45 },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
  error: { color: '#B42318', fontWeight: '700' },
  camera: { flex: 1 },
  cameraActions: { padding: 16, gap: 8, backgroundColor: '#07140E' },
});
