import './src/background-location';
import React from 'react';
import { StatusBar } from 'react-native';
import { RiderNativeApp } from './src/RiderNativeApp';

export default function App() {
  return (
    <>
      <StatusBar barStyle="dark-content" />
      <RiderNativeApp />
    </>
  );
}
