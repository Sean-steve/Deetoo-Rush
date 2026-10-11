import './src/background-location';
import React from 'react';
import { StatusBar } from 'react-native';
import { RiderNativeApp } from './src/RiderNativeApp';
import { RiderFrontendApp } from './src/preview/RiderFrontendApp';
import { RiderConnectedApp } from './src/connected/RiderConnectedApp';
import { shouldUseRiderFrontendMock } from './src/preview/preview-mode';

// Approved Rider frontend is the normal Android experience (including release).
// Design acceptance fixtures require an explicit dev-only mock opt-in.
// The original backend-connected app is a temporary dev rollback path only.
const mock = shouldUseRiderFrontendMock(__DEV__, process.env.EXPO_PUBLIC_RIDER_UI_MODE);
const legacy = __DEV__ && process.env.EXPO_PUBLIC_RIDER_UI_MODE === 'legacy';

export default function App() {
  return <>
    <StatusBar barStyle={mock || !legacy ? 'light-content' : 'dark-content'} backgroundColor="#0C2338" />
    {mock ? <RiderFrontendApp /> : legacy ? <RiderNativeApp /> : <RiderConnectedApp />}
  </>;
}
