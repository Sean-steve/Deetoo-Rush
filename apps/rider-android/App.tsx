import './src/background-location';
import React from 'react';
import { StatusBar } from 'react-native';
import { RiderNativeApp } from './src/RiderNativeApp';
import { Phase1RiderPreview } from './src/preview/Phase1RiderPreview';

// The approved visual experience is isolated until the backend-mapping phase.
// Never switch a production build to mock mode accidentally.
const previewEnabled =
  __DEV__ && process.env.EXPO_PUBLIC_RIDER_UI_MODE === 'mock';

export default function App() {
  return previewEnabled ? (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#0C2338" />
      <Phase1RiderPreview />
    </>
  ) : (
    <>
      <StatusBar barStyle="dark-content" />
      <RiderNativeApp />
    </>
  );
}
