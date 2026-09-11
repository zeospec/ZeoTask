interface UsePwaExitGuardOptions {
  pushToast?: (message: string) => void
}

/**
 * Deprecated: Exit guard removed in favor of simplified native back navigation.
 */
export function usePwaExitGuard(_options?: UsePwaExitGuardOptions) {}
