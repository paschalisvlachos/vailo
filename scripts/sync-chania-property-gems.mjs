/**
 * Add property listing local gems into Area Local Gems for Chania
 * when they are not already present (same name + ~200m, or already linked).
 *
 * Mirrors src/lib/propertyGemAreaSync.ts (skipAiTitles).
 *
 * Usage:
 *   node scripts/sync-chania-property-gems.mjs
 *   node scripts/sync-chania-property-gems.mjs --dry-run
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  addDoc,
  updateDoc,
} = require('firebase/firestore');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');
const LOCATION_MATCH_KM = 0.2;

function loadDotEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'vailoapp-497113';
const apiKey = String(process.env.VITE_FIREBASE_API_KEY || '').trim();
if (!apiKey) {
  console.error('Missing VITE_FIREBASE_API_KEY');
  process.exit(1);
}

const app = initializeApp({
  apiKey,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket:
    process.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1023597244475',
  appId:
    process.env.VITE_FIREBASE_APP_ID || '1:1023597244475:web:d93a069968cda7531bac1e',
});
const db = getFirestore(app);

const country = 'Greece';
const areaId = 'chania';

function normalizePlaceName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0370-\u03ff]/g, '');
}

function gemPrimaryName(gem) {
  return String(gem.name || gem.businessName || '').trim();
}

function parseGemCoords(gem) {
  const latRaw = gem.latitude ?? gem.lat;
  const lngRaw = gem.longitude ?? gem.lng;
  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw ?? ''));
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw ?? ''));
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

function drivingKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function namesLikelySame(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;
  return false;
}

function gemSameNameAndLocation(a, b) {
  const nameA = normalizePlaceName(gemPrimaryName(a));
  const nameB = normalizePlaceName(gemPrimaryName(b));
  if (!nameA || !nameB || !namesLikelySame(nameA, nameB)) return false;
  const ca = parseGemCoords(a);
  const cb = parseGemCoords(b);
  if (!ca || !cb) return false;
  return drivingKm(ca.lat, ca.lng, cb.lat, cb.lng) <= LOCATION_MATCH_KM;
}

function buildInsertedByLabel(propertyName, listingLabel) {
  const prop = String(propertyName || '').trim();
  const listing = String(listingLabel || '').trim();
  if (prop && listing && listing.toLowerCase() !== prop.toLowerCase()) {
    return `${prop} / ${listing}`;
  }
  return prop || listing || 'Property listing';
}

function toAreaGemPayload(propertyGem, meta) {
  const {
    distanceKm: _d,
    distanceTime: _t,
    isLegitPick: _l,
    createdAt: _c,
    id: _id,
    ...rest
  } = propertyGem;

  return {
    ...rest,
    name: gemPrimaryName(propertyGem),
    category: propertyGem.category || propertyGem.categories?.[0] || '',
    categories: propertyGem.categories || (propertyGem.category ? [propertyGem.category] : []),
    sourcePropertyId: meta.propertyId,
    sourcePropertyTypeId: meta.propertyTypeId,
    sourcePropertyGemId: meta.propertyGemId,
    insertedByLabel: meta.insertedByLabel,
    alternateTitles: meta.alternateTitles || [],
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const areaRef = doc(db, 'countries', country, 'areas', areaId);
const areaSnap = await getDoc(areaRef);
if (!areaSnap.exists()) {
  console.error(`Area not found: countries/${country}/areas/${areaId}`);
  process.exit(1);
}
const masterArea = String(areaSnap.data()?.name || 'Chania').trim();

const gemsColl = collection(db, 'countries', country, 'areas', areaId, 'localGems');
const areaGemsSnap = await getDocs(gemsColl);
const areaGems = areaGemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

console.log(
  JSON.stringify(
    {
      projectId,
      areaId,
      masterArea,
      existingAreaGems: areaGems.length,
      dryRun,
    },
    null,
    2
  )
);

const stats = { created: 0, updated: 0, skipped: 0, scanned: 0, listings: 0 };
const propertiesSnap = await getDocs(collection(db, 'properties'));

for (const propDoc of propertiesSnap.docs) {
  const property = propDoc.data();
  const propertyName = String(property.propertyName || propDoc.id);
  const typesSnap = await getDocs(collection(db, 'properties', propDoc.id, 'propertyTypes'));

  for (const typeDoc of typesSnap.docs) {
    const typeData = typeDoc.data();
    const city = String(typeData.city || typeData.area || '').trim();
    if (!city || city.toLowerCase() !== masterArea.toLowerCase()) continue;
    if (typeData.country && String(typeData.country) !== country) continue;

    stats.listings += 1;
    const listingLabel = String(typeData.propertyTypeName || typeData.urlSlug || '').trim();
    const gemsSnap = await getDocs(
      collection(db, 'properties', propDoc.id, 'propertyTypes', typeDoc.id, 'localGems')
    );

    for (const gemDoc of gemsSnap.docs) {
      stats.scanned += 1;
      const propertyGem = { id: gemDoc.id, ...gemDoc.data() };

      const linked = areaGems.find(
        (g) =>
          g.sourcePropertyGemId === gemDoc.id && g.sourcePropertyTypeId === typeDoc.id
      );
      const duplicate = areaGems.find(
        (g) => g.id !== linked?.id && gemSameNameAndLocation(propertyGem, g)
      );

      if (duplicate && !linked) {
        stats.skipped += 1;
        continue;
      }

      const payload = toAreaGemPayload(propertyGem, {
        propertyId: propDoc.id,
        propertyTypeId: typeDoc.id,
        propertyGemId: gemDoc.id,
        insertedByLabel: buildInsertedByLabel(propertyName, listingLabel),
        alternateTitles: Array.isArray(linked?.alternateTitles)
          ? linked.alternateTitles
          : Array.isArray(propertyGem.alternateTitles)
            ? propertyGem.alternateTitles
            : [],
      });

      if (linked) {
        if (!dryRun) {
          await updateDoc(doc(gemsColl, linked.id), payload);
        }
        stats.updated += 1;
        continue;
      }

      if (duplicate) {
        stats.skipped += 1;
        continue;
      }

      if (!dryRun) {
        const ref = await addDoc(gemsColl, {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        areaGems.push({
          id: ref.id,
          ...payload,
          sourcePropertyGemId: gemDoc.id,
          sourcePropertyTypeId: typeDoc.id,
        });
      } else {
        areaGems.push({
          id: `pending-${propDoc.id}-${gemDoc.id}`,
          ...payload,
          sourcePropertyGemId: gemDoc.id,
          sourcePropertyTypeId: typeDoc.id,
        });
      }
      stats.created += 1;
      if (stats.created % 25 === 0) {
        console.log(`… created ${stats.created} so far (scanned ${stats.scanned})`);
      }
    }
  }
}

console.log(JSON.stringify({ ok: true, dryRun, ...stats }, null, 2));
