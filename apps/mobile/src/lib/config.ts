export const mobileConfig = {
  clerkKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
  apiBase: (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/+$/, ''),
  revenueCatAppleKey: process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY ?? '',
  revenueCatGoogleKey: process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY ?? '',
  entitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'premium',
};

export function validateApiBase(value: string): string {
  if (!value) throw new Error('Set EXPO_PUBLIC_API_BASE_URL in apps/mobile/.env');
  const parsed = new URL(value);
  const devHost = ['localhost', '127.0.0.1', '10.0.2.2'].includes(parsed.hostname) ||
    /^192\.168\./.test(parsed.hostname) || /^10\./.test(parsed.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(typeof __DEV__ !== 'undefined' && __DEV__ && parsed.protocol === 'http:' && devHost)) {
    throw new Error('API URL must use HTTPS except for local development');
  }
  return value;
}
