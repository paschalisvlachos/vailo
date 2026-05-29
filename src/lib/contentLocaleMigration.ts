import { collection, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  buildLocalizedFirestorePayload,
  copyPrimaryToEmptyLocales,
  mergeLegacyIntoLocaleMap,
  parsePropertyContentLocaleSettings,
  readLocaleMap,
  type LocaleStringMap,
} from './propertyContentLocales';

const GEM_FIELDS = ['name', 'description', 'category'];
const FEATURE_FIELDS = ['name', 'description'];

function buildMapsFromDoc(
  data: Record<string, unknown>,
  fields: string[],
  primary: string
): Record<string, LocaleStringMap> {
  const maps: Record<string, LocaleStringMap> = {};
  for (const field of fields) {
    maps[field] = mergeLegacyIntoLocaleMap(
      readLocaleMap(data, field),
      typeof data[field] === 'string' ? (data[field] as string) : undefined,
      primary
    );
  }
  return maps;
}

/** Copies primary-locale text into empty slots for other enabled locales on property gems & features. */
export async function migratePropertyContentFromPrimary(propertyId: string): Promise<{
  gemsUpdated: number;
  featuresUpdated: number;
}> {
  const propSnap = await getDoc(doc(db, 'properties', propertyId));
  if (!propSnap.exists()) throw new Error('Property not found');
  const settings = parsePropertyContentLocaleSettings(propSnap.data());
  const primary = settings.primaryLocale;
  const targets = settings.enabledLocales.filter((c) => c !== primary);

  let gemsUpdated = 0;
  let featuresUpdated = 0;

  const typesSnap = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes'));
  for (const typeDoc of typesSnap.docs) {
    const gemsSnap = await getDocs(
      collection(db, 'properties', propertyId, 'propertyTypes', typeDoc.id, 'localGems')
    );
    for (const gemDoc of gemsSnap.docs) {
      const data = gemDoc.data() as Record<string, unknown>;
      const maps = buildMapsFromDoc(data, GEM_FIELDS, primary);
      const filled = copyPrimaryToEmptyLocales(maps, GEM_FIELDS, primary, targets);
      await updateDoc(gemDoc.ref, buildLocalizedFirestorePayload(GEM_FIELDS, filled, primary, {}));
      gemsUpdated += 1;
    }
  }

  const featuresSnap = await getDocs(collection(db, 'properties', propertyId, 'features'));
  for (const featDoc of featuresSnap.docs) {
    const data = featDoc.data() as Record<string, unknown>;
    const maps = buildMapsFromDoc(data, FEATURE_FIELDS, primary);
    const filled = copyPrimaryToEmptyLocales(maps, FEATURE_FIELDS, primary, targets);
    await updateDoc(featDoc.ref, buildLocalizedFirestorePayload(FEATURE_FIELDS, filled, primary, {}));
    featuresUpdated += 1;
  }

  return { gemsUpdated, featuresUpdated };
}
