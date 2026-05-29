import {
  DEFAULT_PRIMARY_LOCALE,
  mergeLegacyIntoLocaleMap,
  normalizeLocaleCode,
  readLocaleMap,
  setLocaleFieldValue,
  type LocaleStringMap,
} from './propertyContentLocales';

export const HOUSE_GUIDE_TEXTAREA_FIELD_IDS = [
  'arrivalInfo',
  'checkoutInfo',
  'electricalPanel',
  'powerOutage',
  'garageManual',
  'emergencyLighting',
  'indoorLights',
  'outdoorLights',
  'acInstructions',
  'heatingInstructions',
  'hotWater',
  'bathroomAmenities',
  'toiletRules',
  'bedroomDetails',
  'extraLinen',
  'kitchenEquipment',
  'applianceInstructions',
  'applianceModels',
  'includedSupplies',
  'neededSupplies',
  'bbqType',
  'bbqInstructions',
  'poolInfo',
  'jacuzziInstructions',
  'wifiInfo',
  'tvStreaming',
  'entertainmentModels',
  'washingMachine',
  'dryerIron',
  'houseRules',
  'quietHours',
  'garbageDisposal',
  'recycling',
  'emergencyInfo',
  'safeBox',
  'cleaningService',
  'maintenanceIssues',
  'extraBatteries',
  'mosquitoEquipment',
  'flashlights',
  'remoteControls',
  'spareKeys',
  'generalItems',
  'electricalAppliances',
  'smartHomeDevices',
] as const;

export type HouseGuideTextFieldId = (typeof HOUSE_GUIDE_TEXTAREA_FIELD_IDS)[number];

export function guideFieldMapKey(fieldId: string): string {
  return `${fieldId}ByLocale`;
}

export function getGuideTextValue(
  data: Record<string, unknown>,
  fieldId: string,
  locale: string,
  primaryLocale: string
): string {
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const code = normalizeLocaleCode(locale) || primary;
  const map = mergeLegacyIntoLocaleMap(
    readLocaleMap(data, fieldId),
    typeof data[fieldId] === 'string' ? (data[fieldId] as string) : undefined,
    primary
  );
  return (map[code] || '').trim();
}

export function hydrateGuideFormDataFromFirestore(
  raw: Record<string, unknown>,
  primaryLocale: string
): Record<string, unknown> {
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const out: Record<string, unknown> = { ...raw };

  for (const fieldId of HOUSE_GUIDE_TEXTAREA_FIELD_IDS) {
    const legacy = typeof raw[fieldId] === 'string' ? (raw[fieldId] as string) : '';
    const map = mergeLegacyIntoLocaleMap(readLocaleMap(raw, fieldId), legacy, primary);
    if (Object.keys(map).length > 0) {
      out[guideFieldMapKey(fieldId)] = map;
    }
    if (legacy.trim()) out[fieldId] = legacy.trim();
    else if (map[primary]) out[fieldId] = map[primary];
  }

  return out;
}

export type HouseGuideFormData = Record<string, string | unknown[] | undefined>;

export function setGuideTextInFormData(
  formData: HouseGuideFormData,
  fieldId: string,
  locale: string,
  value: string,
  primaryLocale: string
): HouseGuideFormData {
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const code = normalizeLocaleCode(locale) || primary;
  const mapKey = guideFieldMapKey(fieldId);
  const rawExisting = formData[mapKey];
  const existing =
    rawExisting && typeof rawExisting === 'object' && !Array.isArray(rawExisting)
      ? (rawExisting as LocaleStringMap)
      : mergeLegacyIntoLocaleMap(
          {},
          typeof formData[fieldId] === 'string' ? (formData[fieldId] as string) : undefined,
          primary
        );
  const nextMap = setLocaleFieldValue(existing, code, value);
  const next: HouseGuideFormData = { ...formData };
  (next as Record<string, unknown>)[mapKey] = nextMap;
  if (code === primary) next[fieldId] = value.trim();
  return next;
}

export function serializeGuideFormDataForSave(
  formData: HouseGuideFormData,
  primaryLocale: string
): Record<string, unknown> {
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const payload: Record<string, unknown> = { ...formData };

  for (const fieldId of HOUSE_GUIDE_TEXTAREA_FIELD_IDS) {
    const mapKey = guideFieldMapKey(fieldId);
    const rawMap = formData[mapKey];
    let map: LocaleStringMap = {};
    if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
      map = rawMap as LocaleStringMap;
    }
    map = mergeLegacyIntoLocaleMap(
      map,
      typeof formData[fieldId] === 'string' ? (formData[fieldId] as string) : undefined,
      primary
    );
    const cleaned: LocaleStringMap = {};
    for (const [k, v] of Object.entries(map)) {
      const c = normalizeLocaleCode(k);
      const t = (v || '').trim();
      if (c && t) cleaned[c] = t;
    }
    if (Object.keys(cleaned).length > 0) payload[mapKey] = cleaned;
    const primaryText = (cleaned[primary] || '').trim();
    if (primaryText) payload[fieldId] = primaryText;
    else delete payload[fieldId];
  }

  return payload;
}

export function buildGuideRecordForLocale(
  data: Record<string, unknown>,
  locale: string,
  primaryLocale: string
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const fieldId of HOUSE_GUIDE_TEXTAREA_FIELD_IDS) {
    out[fieldId] = getGuideTextValue(data, fieldId, locale, primaryLocale);
  }
  return out;
}
