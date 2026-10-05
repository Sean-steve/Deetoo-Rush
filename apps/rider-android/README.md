# Deetoo Rider Android

Phase 1 establishes the native application boundary and bearer-session contract.

The production Rider client must use the central Deetoo API over HTTPS and a `SecureCredentialStore` backed by Android Keystore/encrypted storage. Browser `localStorage`/AsyncStorage are not acceptable for refresh credentials.

Phase 2 adds the React Native Android UI and device capabilities:

- foreground/background location service;
- FCM offer notifications;
- delivery navigation;
- camera/proof capture;
- offline/retry recovery;
- persistent active-delivery notification.

The existing `apps/rider` browser implementation is a simulator only.
