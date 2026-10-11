/**
 * Only explicit development builds may render mock login, OTP and financial states.
 * This guard must never be relaxed during the Rider backend integration phase.
 */
export function shouldUseRiderFrontendMock(isDevelopment: boolean, configuredMode: string | undefined): boolean {
  return isDevelopment === true && configuredMode === 'mock';
}
