export function riderApiOrigin(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!configured) {
    if (__DEV__) return 'http://10.0.2.2:3000';
    throw new Error('EXPO_PUBLIC_API_BASE_URL is required for Rider Android');
  }
  return configured.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
}
