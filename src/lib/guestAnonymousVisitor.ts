const VISITOR_STORAGE_KEY = 'vailo_guest_anonymous_visitor';

export function getOrCreateAnonymousVisitorId(): string {
  try {
    const raw = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string };
      if (typeof parsed.id === 'string' && parsed.id.trim()) {
        return parsed.id.trim();
      }
    }
  } catch {
    /* ignore */
  }

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `v-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  try {
    localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify({ id, createdAt: Date.now() }));
  } catch {
    /* ignore */
  }
  return id;
}
