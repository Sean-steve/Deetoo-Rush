import './src/background-location';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { RiderNativeApp } from './src/RiderNativeApp';

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <RiderNativeApp />
    </>
  );
}
