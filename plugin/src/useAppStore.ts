import { useSyncExternalStore } from 'preact/compat'
import { appStore } from './store.js'
import type { AppState } from './store.js'

export function useAppStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    appStore.subscribe,
    () => selector(appStore.getState()),
  )
}
