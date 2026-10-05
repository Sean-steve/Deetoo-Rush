import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { DeetooApiClient } from '@deetoo/api-client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerRiderPushDevice(
  client: DeetooApiClient,
  appVersion = '0.2.0',
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('The production Rider application currently supports Android only.');
  }

  await Notifications.setNotificationChannelAsync('delivery_offers', {
    name: 'Delivery offers',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== 'granted') {
    finalStatus = (await Notifications.requestPermissionsAsync()).status;
  }
  if (finalStatus !== 'granted') {
    throw new Error('Push notification permission is required to receive delivery offers.');
  }

  const nativeToken = await Notifications.getDevicePushTokenAsync();
  const pushToken = String(nativeToken.data || '');
  if (!pushToken) throw new Error('Android did not return an FCM device token.');

  await client.request('/devices/register', {
    method: 'POST',
    body: JSON.stringify({
      recipient_type: 'RIDER',
      platform: 'ANDROID',
      push_token: pushToken,
      app_version: appVersion,
    }),
  });

  return pushToken;
}

export function subscribeToOfferNotifications(
  onOffer: (offerId?: string) => void,
): () => void {
  const received = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as Record<string, unknown>;
    if (String(data.templateCode || '') === 'RIDER_NEW_OFFER') {
      onOffer(data.offerId ? String(data.offerId) : undefined);
    }
  });
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    const data = event.notification.request.content.data as Record<string, unknown>;
    if (String(data.templateCode || '') === 'RIDER_NEW_OFFER') {
      onOffer(data.offerId ? String(data.offerId) : undefined);
    }
  });
  return () => {
    received.remove();
    response.remove();
  };
}
