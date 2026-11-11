import React from 'react';
import { ClerkProvider } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import { Stack } from 'expo-router';
import { mobileConfig } from '../lib/config';

if (!mobileConfig.clerkKey) throw new Error('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in apps/mobile/.env');
export default function RootLayout(){
  return <ClerkProvider publishableKey={mobileConfig.clerkKey} tokenCache={tokenCache}>
    <Stack screenOptions={{headerShown:false}}><Stack.Screen name="index"/><Stack.Screen name="(tabs)"/></Stack>
  </ClerkProvider>;
}
