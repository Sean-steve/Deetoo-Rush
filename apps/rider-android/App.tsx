import './src/background-location';
import React from 'react';
import { StatusBar } from 'react-native';
import { RiderNativeApp } from './src/RiderNativeApp';
import { RiderFrontendApp } from './src/preview/RiderFrontendApp';
import { shouldUseRiderFrontendMock } from './src/preview/preview-mode';

// The approved visual experience is isolated until the backend-mapping phase.
// Never switch a production build to mock mode accidentally.
const previewEnabled = shouldUseRiderFrontendMock(
  __DEV__,
  process.env.EXPO_PUBLIC_RIDER_UI_MODE,
);

export default function App() {
  return previewEnabled ? (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0C2338" />
      <RiderFrontendApp />
    </>
  ) : (
    <>
      <StatusBar barStyle="dark-content" />
      <RiderNativeApp />
    </>
  );
}
