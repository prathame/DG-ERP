/** True when this build is the offline Service Mobile Capacitor app. */
export function isServiceMobileMode(): boolean {
  try {
    return (import.meta.env.VITE_DEPLOYMENT_MODE as string | undefined) === 'service-mobile';
  } catch {
    return false;
  }
}

export function serviceMobileAppVersion(): string {
  return (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.1.0';
}
