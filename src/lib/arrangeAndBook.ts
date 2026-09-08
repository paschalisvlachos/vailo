/** Platform taxonomy for Arrange and Book — one provider can offer many services. */

export type ArrangeAndBookSubcategory = {
  id: string;
  label: string;
};

export type ArrangeAndBookCategory = {
  id: string;
  label: string;
  subcategories: ArrangeAndBookSubcategory[];
};

export const ARRANGE_AND_BOOK_CATEGORIES: ArrangeAndBookCategory[] = [
  {
    id: 'experiences',
    label: 'Experiences',
    subcategories: [
      { id: 'excursions', label: 'Excursions' },
      { id: 'sailing', label: 'Sailing' },
      { id: 'yacht_boat_charter', label: 'Yacht / boat charter' },
      { id: 'diving', label: 'Diving' },
      { id: 'snorkeling', label: 'Snorkeling' },
      { id: 'hiking_tours', label: 'Hiking tours' },
      { id: 'wine_tours', label: 'Wine tours' },
      { id: 'cooking_classes', label: 'Cooking classes' },
      { id: 'horse_riding', label: 'Horse riding' },
      { id: 'private_tours', label: 'Private tours' },
    ],
  },
  {
    id: 'transport',
    label: 'Transport',
    subcategories: [
      { id: 'airport_transfer', label: 'Airport transfer' },
      { id: 'taxi', label: 'Taxi' },
      { id: 'private_driver', label: 'Private driver' },
      { id: 'limousine', label: 'Limousine' },
      { id: 'car_rental', label: 'Car rental' },
      { id: 'scooter_atv_rental', label: 'Scooter / ATV rental' },
      { id: 'bicycle_ebike_rental', label: 'Bicycle / e-bike rental' },
    ],
  },
  {
    id: 'food_dining',
    label: 'Food & Dining',
    subcategories: [
      { id: 'private_chef', label: 'Private chef' },
      { id: 'breakfast_at_the_villa', label: 'Breakfast at the villa' },
      { id: 'grocery_pre_stocking', label: 'Grocery pre-stocking' },
      { id: 'grocery_delivery', label: 'Grocery delivery' },
      { id: 'restaurant_reservations', label: 'Restaurant reservations' },
      { id: 'bbq_chef', label: 'BBQ chef' },
      { id: 'wine_delivery', label: 'Wine delivery' },
      { id: 'picnic_setup', label: 'Picnic setup' },
    ],
  },
  {
    id: 'wellness',
    label: 'Wellness',
    subcategories: [
      { id: 'massage', label: 'Massage' },
      { id: 'yoga', label: 'Yoga' },
      { id: 'pilates', label: 'Pilates' },
      { id: 'personal_trainer', label: 'Personal trainer' },
      { id: 'beauty_treatments', label: 'Beauty treatments' },
      { id: 'hairdresser', label: 'Hairdresser' },
      { id: 'makeup_artist', label: 'Makeup artist' },
    ],
  },
  {
    id: 'at_the_villa',
    label: 'At the Villa',
    subcategories: [
      { id: 'extra_housekeeping', label: 'Extra housekeeping' },
      { id: 'linen_towel_change', label: 'Linen / towel change' },
      { id: 'laundry', label: 'Laundry' },
      { id: 'ironing', label: 'Ironing' },
      { id: 'poolside_setup', label: 'Poolside setup' },
      { id: 'luggage_assistance', label: 'Luggage assistance' },
    ],
  },
  {
    id: 'family',
    label: 'Family',
    subcategories: [
      { id: 'babysitting', label: 'Babysitting' },
      { id: 'baby_equipment_rental', label: 'Baby equipment rental' },
      { id: 'high_chair_cot', label: 'High chair / cot' },
      { id: 'family_activities', label: 'Family activities' },
      { id: 'kids_entertainment', label: "Kids' entertainment" },
    ],
  },
  {
    id: 'celebrations',
    label: 'Celebrations',
    subcategories: [
      { id: 'birthday_setup', label: 'Birthday setup' },
      { id: 'anniversary_surprise', label: 'Anniversary surprise' },
      { id: 'flowers', label: 'Flowers' },
      { id: 'cake', label: 'Cake' },
      { id: 'photographer', label: 'Photographer' },
      { id: 'proposal_planning', label: 'Proposal planning' },
      { id: 'private_dinner', label: 'Private dinner' },
      { id: 'decorations', label: 'Decorations' },
    ],
  },
  {
    id: 'vip_luxury',
    label: 'VIP & Luxury',
    subcategories: [
      { id: 'chauffeur', label: 'Chauffeur' },
      { id: 'luxury_car', label: 'Luxury car' },
      { id: 'yacht', label: 'Yacht' },
      { id: 'private_aviation', label: 'Private aviation / heli transfer' },
      { id: 'personal_shopper', label: 'Personal shopper' },
      { id: 'premium_reservations', label: 'Premium reservations' },
    ],
  },
  {
    id: 'everyday_needs',
    label: 'Everyday Needs',
    subcategories: [
      { id: 'pharmacy_delivery', label: 'Pharmacy delivery' },
      { id: 'groceries', label: 'Groceries' },
      { id: 'luggage_storage', label: 'Luggage storage' },
      { id: 'courier', label: 'Courier' },
      { id: 'local_shopping', label: 'Local shopping' },
      { id: 'forgotten_essentials', label: 'Forgotten essentials' },
    ],
  },
];

const CATEGORY_BY_ID = new Map(ARRANGE_AND_BOOK_CATEGORIES.map((category) => [category.id, category]));
const SUBCATEGORY_BY_ID = new Map(
  ARRANGE_AND_BOOK_CATEGORIES.flatMap((category) =>
    category.subcategories.map((sub) => [sub.id, { ...sub, categoryId: category.id, categoryLabel: category.label }])
  )
);

export type ArrangeAndBookSubcategoryRef = ArrangeAndBookSubcategory & {
  categoryId: string;
  categoryLabel: string;
};

export function arrangeAndBookCategoryById(id: string): ArrangeAndBookCategory | undefined {
  return CATEGORY_BY_ID.get(id);
}

export function arrangeAndBookSubcategoryById(id: string): ArrangeAndBookSubcategoryRef | undefined {
  return SUBCATEGORY_BY_ID.get(id);
}

export function arrangeAndBookCategoryLabel(id: string): string {
  return CATEGORY_BY_ID.get(id)?.label || id;
}

export function arrangeAndBookSubcategoryLabel(id: string): string {
  return SUBCATEGORY_BY_ID.get(id)?.label || id;
}

export function parseIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeArrangeAndBookSelection(
  categoryIds: string[],
  subcategoryIds: string[]
): { categoryIds: string[]; subcategoryIds: string[] } {
  const validSubs = subcategoryIds.filter((id) => SUBCATEGORY_BY_ID.has(id));
  const derivedCategories = new Set<string>(categoryIds.filter((id) => CATEGORY_BY_ID.has(id)));
  for (const subId of validSubs) {
    const ref = SUBCATEGORY_BY_ID.get(subId);
    if (ref) derivedCategories.add(ref.categoryId);
  }
  return {
    categoryIds: ARRANGE_AND_BOOK_CATEGORIES.map((c) => c.id).filter((id) => derivedCategories.has(id)),
    subcategoryIds: ARRANGE_AND_BOOK_CATEGORIES.flatMap((c) => c.subcategories)
      .map((s) => s.id)
      .filter((id) => validSubs.includes(id)),
  };
}

export function toggleArrangeAndBookCategory(
  categoryId: string,
  selectedCategoryIds: string[],
  selectedSubcategoryIds: string[]
): { categoryIds: string[]; subcategoryIds: string[] } {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) {
    return { categoryIds: selectedCategoryIds, subcategoryIds: selectedSubcategoryIds };
  }

  const isSelected = selectedCategoryIds.includes(categoryId);
  if (isSelected) {
    const subIds = new Set(category.subcategories.map((s) => s.id));
    return normalizeArrangeAndBookSelection(
      selectedCategoryIds.filter((id) => id !== categoryId),
      selectedSubcategoryIds.filter((id) => !subIds.has(id))
    );
  }

  return normalizeArrangeAndBookSelection([...selectedCategoryIds, categoryId], selectedSubcategoryIds);
}

export function toggleArrangeAndBookSubcategory(
  subcategoryId: string,
  selectedCategoryIds: string[],
  selectedSubcategoryIds: string[]
): { categoryIds: string[]; subcategoryIds: string[] } {
  const ref = SUBCATEGORY_BY_ID.get(subcategoryId);
  if (!ref) {
    return { categoryIds: selectedCategoryIds, subcategoryIds: selectedSubcategoryIds };
  }

  const isSelected = selectedSubcategoryIds.includes(subcategoryId);
  const nextSubs = isSelected
    ? selectedSubcategoryIds.filter((id) => id !== subcategoryId)
    : [...selectedSubcategoryIds, subcategoryId];
  const nextCats = isSelected
    ? selectedCategoryIds
    : selectedCategoryIds.includes(ref.categoryId)
      ? selectedCategoryIds
      : [...selectedCategoryIds, ref.categoryId];

  return normalizeArrangeAndBookSelection(nextCats, nextSubs);
}

export function providerOffersCategory(
  provider: { serviceCategoryIds?: string[]; serviceSubcategoryIds?: string[] },
  categoryId: string
): boolean {
  if (!categoryId) return true;
  if (provider.serviceCategoryIds?.includes(categoryId)) return true;
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return false;
  const subIds = new Set(category.subcategories.map((s) => s.id));
  return (provider.serviceSubcategoryIds || []).some((id) => subIds.has(id));
}

export function providerOffersSubcategory(
  provider: { serviceSubcategoryIds?: string[] },
  subcategoryId: string
): boolean {
  if (!subcategoryId) return true;
  return (provider.serviceSubcategoryIds || []).includes(subcategoryId);
}

export function formatProviderServicesSummary(
  provider: { serviceCategoryIds?: string[]; serviceSubcategoryIds?: string[] },
  options: { maxItems?: number; offeringCount?: number } = {}
): string {
  const maxItems = options.maxItems ?? 3;
  const labels = (provider.serviceSubcategoryIds || [])
    .map((id) => SUBCATEGORY_BY_ID.get(id)?.label)
    .filter((label): label is string => Boolean(label));

  if (labels.length === 0) {
    const categoryLabels = (provider.serviceCategoryIds || [])
      .map((id) => CATEGORY_BY_ID.get(id)?.label)
      .filter((label): label is string => Boolean(label));
    if (categoryLabels.length > 0) {
      if (categoryLabels.length <= maxItems) return categoryLabels.join(', ');
      return `${categoryLabels.slice(0, maxItems).join(', ')} +${categoryLabels.length - maxItems}`;
    }
    if ((options.offeringCount || 0) > 0) return 'Excursions';
    return '—';
  }

  if (labels.length <= maxItems) return labels.join(', ');
  return `${labels.slice(0, maxItems).join(', ')} +${labels.length - maxItems}`;
}

export function adminArrangeAndBookServicesPath(
  categoryId: string,
  subcategoryId?: string
): string {
  const params = new URLSearchParams({ category: categoryId });
  if (subcategoryId) params.set('subcategory', subcategoryId);
  return `/excursions/services?${params.toString()}`;
}

export function withArrangeAndBookReturnTo(
  path: string,
  categoryId?: string,
  subcategoryId?: string
): string {
  if (!categoryId) return path;
  const params = new URLSearchParams();
  params.set('from', 'services');
  params.set('category', categoryId);
  if (subcategoryId) params.set('subcategory', subcategoryId);
  return `${path}?${params.toString()}`;
}

export function arrangeAndBookReturnPath(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get('from') !== 'services') return null;
  const categoryId = params.get('category');
  if (!categoryId) return null;
  return adminArrangeAndBookServicesPath(categoryId, params.get('subcategory') || undefined);
}
