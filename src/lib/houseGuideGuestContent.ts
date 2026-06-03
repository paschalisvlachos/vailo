import { getGuideTextValue } from './houseGuideLocales';
import type { HouseGuideCategoryDef, HouseGuideFieldDef } from './houseGuideCategories';

function arrayHasEntries(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function houseGuideFieldHasContent(
  guide: Record<string, unknown>,
  field: HouseGuideFieldDef,
  locale: string,
  primaryLocale: string
): boolean {
  if (field.type === 'textarea') {
    return Boolean(getGuideTextValue(guide, field.id, locale, primaryLocale).trim());
  }
  return arrayHasEntries(guide[field.id]);
}

export function houseGuideCategoryHasContent(
  guide: Record<string, unknown> | null | undefined,
  category: HouseGuideCategoryDef,
  locale: string,
  primaryLocale: string
): boolean {
  if (!guide) return false;
  return category.fields.some((field) =>
    houseGuideFieldHasContent(guide, field, locale, primaryLocale)
  );
}

export function listHouseGuideCategoriesWithContent(
  guide: Record<string, unknown> | null | undefined,
  categories: HouseGuideCategoryDef[],
  locale: string,
  primaryLocale: string
): HouseGuideCategoryDef[] {
  return categories.filter((cat) =>
    houseGuideCategoryHasContent(guide, cat, locale, primaryLocale)
  );
}
