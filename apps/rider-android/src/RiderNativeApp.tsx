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

function errorMessage(error: unknown): string {
  const value = error as any;
  return value?.error?.message || value?.message || 'Something went wrong';
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
  const session = useMemo(
    () =>
      createRiderAndroidSession({
        apiBaseUrl: riderApiOrigin(),
        secureStore: riderSecureStore,
      }),
    [],
  );
  const client = session.client;

  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [offer, setOffer] = useState<any>(null);
  const [active, setActive] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [earnings, setEarnings] = useState<any>(null);
  const [pickupCode, setPickupCode] = useState('');
  const [deliveryOtp, setDeliveryOtp] = useState('');
  const [incidentNote, setIncidentNote] = useState('');
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
    if (!user) return;
    void registerRiderPushDevice(client).catch((error) => {
      setMessage(`Push setup: ${errorMessage(error)}`);
    });
    return subscribeToOfferNotifications(() => {
      void refresh();
    });
  }, [client, refresh, user]);

  useEffect(() => {
    if (status?.profile?.workStatus && status.profile.workStatus !== 'OFFLINE') {
      void startRiderLocationService().catch((error) =>
        setMessage(errorMessage(error)),
      );
    }
  }, [status?.profile?.workStatus]);

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
      const authenticated = await session.login(identifier.trim(), password);
      if (!authenticated.roles?.map(String).some((role) => role.toLowerCase() === 'rider')) {
        await session.logout();
        throw new Error('This account is not a Rider account.');
      }
      setUser(authenticated);
      await registerRiderPushDevice(client).catch(() => undefined);
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
  }

  async function goOffline() {
    await client.request('/rider/availability/offline', { method: 'POST' });
    await stopRiderLocationService();
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
          <Text style={styles.brand}>Deetoo Rider</Text>
          <Text style={styles.muted}>Sign in with your approved Rider account.</Text>
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
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Deetoo Rider</Text>
            <Text style={styles.muted}>{user.email || user.phone_e164 || user.id}</Text>
          </View>
          <Pressable onPress={() => void logout()} disabled={busy}>
            <Text style={styles.link}>Sign out</Text>
          </Pressable>
        </View>

        {message && (
          <View style={styles.notice}>
            <Text>{message}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Availability</Text>
          <Text style={styles.status}>{workStatus}</Text>
          <Text style={styles.muted}>
            GPS: {status?.locationFreshness?.isStale ? 'stale / unavailable' : 'fresh'}
          </Text>
          {workStatus === 'OFFLINE' ? (
            <ActionButton label={busy ? 'Starting…' : 'Go online'} disabled={busy} onPress={() => void perform(goOnline, 'You are online.')} />
          ) : (
            <ActionButton label={busy ? 'Stopping…' : 'Go offline'} disabled={busy || workStatus === 'BUSY'} danger onPress={() => void perform(goOffline, 'You are offline.')} />
          )}
        </View>

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

        <ActionButton label="Refresh" disabled={busy} onPress={() => void refresh()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F4' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  loginCard: { margin: 20, marginTop: 120, padding: 20, gap: 14, backgroundColor: '#fff', borderRadius: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 28, fontWeight: '800', color: '#10231A' },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#10231A' },
  bigText: { fontSize: 20, fontWeight: '700', color: '#10231A' },
  status: { fontSize: 16, fontWeight: '800', color: '#00A651', marginVertical: 6 },
  muted: { color: '#68736D', marginTop: 4 },
  money: { fontWeight: '800', marginVertical: 8 },
  link: { color: '#006D3C', fontWeight: '700', paddingVertical: 8 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 10 },
  offerCard: { backgroundColor: '#E9FFF2', borderColor: '#00A651', borderWidth: 2, borderRadius: 18, padding: 16, gap: 10 },
  notice: { padding: 12, backgroundColor: '#FFF5D6', borderRadius: 12 },
  incident: { marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#ccc', gap: 8 },
  input: { backgroundColor: '#F3F4F1', borderColor: '#D6D9D4', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  button: { backgroundColor: '#00A651', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  dangerButton: { backgroundColor: '#B42318' },
  disabledButton: { opacity: 0.45 },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  error: { color: '#B42318', fontWeight: '600' },
  camera: { flex: 1 },
  cameraActions: { padding: 16, gap: 8, backgroundColor: '#111' },
});
