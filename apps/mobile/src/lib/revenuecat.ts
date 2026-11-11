import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { mobileConfig } from './config';

let configured = false;
let activeAppUserId: string | null = null;

/** UI-only subscription preview in 4A. Never use this alone to authorize backend premium operations. */
export async function identifyRevenueCatUser(clerkUserId: string) {
  if (!clerkUserId) return { ready: false, message: 'Sign in required' };
  const key = Platform.OS === 'ios' ? mobileConfig.revenueCatAppleKey
    : Platform.OS === 'android' ? mobileConfig.revenueCatGoogleKey : '';
  if (!key) return { ready: false, message: 'RevenueCat key not configured yet' };
  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey: key, appUserID: clerkUserId });
    configured = true;
    activeAppUserId = clerkUserId;
  } else if (activeAppUserId !== clerkUserId) {
    await Purchases.logIn(clerkUserId);
    activeAppUserId = clerkUserId;
  }
  const info = await Purchases.getCustomerInfo();
  return { ready: true, active: Boolean(info.entitlements.active[mobileConfig.entitlementId]) };
}

/** Intentionally never call Purchases.logOut(): anonymous accounts can merge on restoration. */
export function clearRevenueCatUiOnSignOut() { activeAppUserId = null; }
