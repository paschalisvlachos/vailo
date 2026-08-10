/** Predefined excursion categories for admin multi-select. */

export type ExcursionCategoryOption = {
  id: string;
  label: string;
};

export const EXCURSION_CATEGORY_OPTIONS: ExcursionCategoryOption[] = [
  { id: 'hiking', label: 'Hiking & trekking' },
  { id: 'nature', label: 'Nature & wildlife' },
  { id: 'boat', label: 'Boat & sea' },
  { id: 'water', label: 'Water activities' },
  { id: 'food_wine', label: 'Food & wine' },
  { id: 'culture', label: 'Culture & history' },
  { id: 'sightseeing', label: 'Sightseeing' },
  { id: 'adventure', label: 'Adventure & sports' },
  { id: 'family', label: 'Family friendly' },
  { id: 'transfer', label: 'Transfer & transport' },
  { id: 'wellness', label: 'Wellness & relaxation' },
  { id: 'photography', label: 'Photography tour' },
];

/** Legacy category ids/labels — tour type comes from pricing model, not categories. */
export const EXCURSION_TOUR_TYPE_CATEGORY_IDS = ['private', 'group'] as const;

export function isExcursionTourTypeCategory(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    (EXCURSION_TOUR_TYPE_CATEGORY_IDS as readonly string[]).includes(normalized) ||
    normalized === 'private tour' ||
    normalized === 'group tour'
  );
}

export function excursionCategoryLabel(id: string): string | undefined {
  return EXCURSION_CATEGORY_OPTIONS.find((o) => o.id === id)?.label;
}

export function categoriesFormFromDoc(categories?: string[]): {
  selectedIds: string[];
  custom: string;
} {
  const selectedIds: string[] = [];
  const custom: string[] = [];

  for (const raw of categories || []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const match = EXCURSION_CATEGORY_OPTIONS.find(
      (o) => o.id === value || o.label.toLowerCase() === value.toLowerCase()
    );
    if (match) {
      if (!selectedIds.includes(match.id)) selectedIds.push(match.id);
    } else {
      custom.push(value);
    }
  }

  return { selectedIds, custom: custom.join(', ') };
}

export function categoriesPayloadFromForm(
  selectedIds: string[],
  custom: string
): string[] | undefined {
  const labels = selectedIds
    .map((id) => excursionCategoryLabel(id))
    .filter((label): label is string => Boolean(label));
  const extras = custom
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const all = [...labels, ...extras];
  return all.length > 0 ? all : undefined;
}

export function formatExcursionCategoriesSummary(categories?: string[]): string {
  if (!categories?.length) return '—';
  if (categories.length <= 2) return categories.join(', ');
  return `${categories.slice(0, 2).join(', ')} +${categories.length - 2}`;
}
