// Module-level synchronous cache scoped by tenant/user so page transitions
// render immediately without skeleton flashes while Dexie liveQuery attaches.

const hookDataCache = new Map<string, unknown>();

function makeKey(hookName: string, scopeId?: string | null): string {
  return `${hookName}:${scopeId || 'none'}`;
}

export function getHookCache<T>(hookName: string, scopeId?: string | null): T | undefined {
  if (!scopeId) return undefined;
  return hookDataCache.get(makeKey(hookName, scopeId)) as T | undefined;
}

export function hasHookCache(hookName: string, scopeId?: string | null): boolean {
  if (!scopeId) return false;
  return hookDataCache.has(makeKey(hookName, scopeId));
}

export function setHookCache<T>(hookName: string, scopeId: string | null | undefined, value: T): void {
  if (!scopeId) return;
  hookDataCache.set(makeKey(hookName, scopeId), value);
}

export function clearHookCacheForScope(scopeId?: string | null): void {
  if (!scopeId) return;
  const suffix = `:${scopeId}`;
  for (const key of Array.from(hookDataCache.keys())) {
    if (key.endsWith(suffix)) {
      hookDataCache.delete(key);
    }
  }
}

export function clearAllHookCaches(): void {
  hookDataCache.clear();
}
