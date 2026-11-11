import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/expo';
import { SignIn, SignUp } from '@clerk/expo/web';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Page, Panel, Action, Muted, Loading } from '../components/ui';

/**
 * Expo web uses Clerk's web components. The native index.tsx uses
 * useHostedAuth(), which is intended for iOS / Android auth sessions.
 */
export default function WelcomeWeb() {
  const { isLoaded, isSignedIn } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  useEffect(() => {
    if (isLoaded && isSignedIn) router.replace('/(tabs)');
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || isSignedIn) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><Loading /></View>;
  }

  return (
    <Page
      title="Receipt Price Tracker"
      subtitle="Know what you paid, spot price changes, and keep your grocery and gas receipts together."
    >
      <Panel>
        <Muted>Welcome. Sign in securely with Clerk to access your private receipt history.</Muted>
        <Action
          label={mode === 'sign-in' ? 'Sign in (selected)' : 'Switch to sign in'}
          onPress={() => setMode('sign-in')}
        />
        <Action
          label={mode === 'sign-up' ? 'Create account (selected)' : 'Switch to create account'}
          onPress={() => setMode('sign-up')}
        />
        <View style={{ marginTop: 14, alignItems: 'center' }}>
          {mode === 'sign-in' ? <SignIn /> : <SignUp />}
        </View>
      </Panel>
      <Panel>
        <Muted>
          Premium is planned with monthly and annual plans and a 7-day free trial.
          No payments are taken in this development build.
        </Muted>
      </Panel>
    </Page>
  );
}
