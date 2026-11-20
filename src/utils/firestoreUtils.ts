/**
 * Recursively strips keys with `undefined` values so Firestore setDoc/updateDoc
 * never fails with "Unsupported field value: undefined".
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        cleaned[key] = stripUndefined(val);
      }
    }
    return cleaned as T;
  }
  return value;
}
