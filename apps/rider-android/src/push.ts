import { Platform } from 'react-native';
import type { DeetooApiClient } from '@deetoo/api-client';

type NotificationsModule = typeof import('expo-notifications');

let notificationsPromise: Promise<NotificationsModule> | null = null;
let notificationHandlerInstalled = false;

async function loadNotifications(): Promise<NotificationsModule> {
  if (!notificationsPromise) {
    notificationsPromise = import('expo-notifications').then((Notifications) => {
      if (!notificationHandlerInstalled) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        notificationHandlerInstalled = true;
      }
      return Notifications;
    });
  }
  return notificationsPromise;
}

function pushSetupMessage(error: unknown): string {
  const detail =
    error instanceof Error ? error.message : String(error || 'Unknown notification error');
  return (
    'Push notifications are unavailable in this runtime. Use an Android development build ' +
    'with Firebase google-services.json configured; Expo Go cannot receive Android remote ' +
    `push notifications. Native detail: ${detail}`
  );
}

export async function registerRiderPushDevice(
  client: DeetooApiClient,
  appVersion = '0.2.0',
): Promise<string> {
  if (Platform.OS !== 'android') {
    throw new Error('The production Rider application currently supports Android only.');
  }

  let Notifications: NotificationsModule;
  try {
    Notifications = await loadNotifications();
  } catch (error) {
    throw new Error(pushSetupMessage(error));
  }

  try {
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
      throw new Error(
        'Push notification permission is required to receive delivery offers.',
      );
    }

    const nativeToken = await Notifications.getDevicePushTokenAsync();
    const pushToken = String(nativeToken.data || '');
    if (!pushToken) {
      throw new Error('Android did not return an FCM device token.');
    }

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
  } catch (error) {
    throw new Error(pushSetupMessage(error));
  }
}

export function subscribeToOfferNotifications(
  onOffer: (offerId?: string) => void,
): () => void {
  let disposed = false;
  let received: { remove: () => void } | undefined;
  let response: { remove: () => void } | undefined;

  void loadNotifications()
    .then((Notifications) => {
      if (disposed) return;

      received = Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data as Record<string, unknown>;
        if (String(data.templateCode || '') === 'RIDER_NEW_OFFER') {
          onOffer(data.offerId ? String(data.offerId) : undefined);
        }
      });
      response = Notifications.addNotificationResponseReceivedListener((event) => {
        const data = event.notification.request.content.data as Record<string, unknown>;
        if (String(data.templateCode || '') === 'RIDER_NEW_OFFER') {
          onOffer(data.offerId ? String(data.offerId) : undefined);
        }
      });
    })
    .catch(() => {
      // Push is optional for rendering. Registration reports actionable setup errors
      // without allowing notification bootstrap to blank the Rider application.
    });

  return () => {
    disposed = true;
    received?.remove();
    response?.remove();
  };
}
