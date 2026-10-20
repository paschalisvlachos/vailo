/**
 * Import curated places from json/greece_heraklion.json into
 * countries/Greece/areas/heraklion/discoveredPlaces (production by default).
 *
 * Uses the Firebase web client SDK (open write rules until 2027).
 * Loads VITE_FIREBASE_* from .env when present.
 *
 * Usage:
 *   node scripts/import-heraklion-discovered.mjs
 *   node scripts/import-heraklion-discovered.mjs --dry-run
 */
import { createHash } from 'node:crypto';
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
  collection,
  writeBatch,
  serverTimestamp,
  arrayUnion,
} = require('firebase/firestore');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const jsonPath = join(root, 'json', 'greece_heraklion.json');

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
const country = 'Greece';
const areaId = 'heraklion';
const dryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 400;
const SOURCE = 'json_import';

const apiKey = String(process.env.VITE_FIREBASE_API_KEY || '').trim();
if (!apiKey) {
  console.error('Missing VITE_FIREBASE_API_KEY (set in .env or environment).');
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

function normalizePlaceName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0370-\u03ff]/g, '');
}

function stablePlaceDocId(googlePlaceId, normalizedName, latitude, longitude) {
  if (googlePlaceId) {
    return createHash('sha256').update(`gp:${googlePlaceId}`).digest('hex').slice(0, 40);
  }
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    const bucket = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    return createHash('sha256')
      .update(`geo:${normalizedName}|${bucket}`)
      .digest('hex')
      .slice(0, 40);
  }
  return createHash('sha256').update(`name:${normalizedName}`).digest('hex').slice(0, 40);
}

function titleCaseCategory(value) {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const places = JSON.parse(readFileSync(jsonPath, 'utf8'));
if (!Array.isArray(places) || places.length === 0) {
  console.error('No places found in', jsonPath);
  process.exit(1);
}

const areaRef = doc(db, 'countries', country, 'areas', areaId);
const areaSnap = await getDoc(areaRef);
if (!areaSnap.exists()) {
  console.error(`Area not found: countries/${country}/areas/${areaId}`);
  process.exit(1);
}

const coll = collection(db, 'countries', country, 'areas', areaId, 'discoveredPlaces');
console.log(
  JSON.stringify(
    {
      projectId,
      path: `countries/${country}/areas/${areaId}/discoveredPlaces`,
      areaName: areaSnap.data()?.name || areaId,
      inputCount: places.length,
      dryRun,
    },
    null,
    2
  )
);

let created = 0;
let updated = 0;
let skipped = 0;
let batch = writeBatch(db);
let ops = 0;

async function flush() {
  if (ops === 0) return;
  if (!dryRun) await batch.commit();
  batch = writeBatch(db);
  ops = 0;
}

for (const place of places) {
  const name = String(place.name || '').trim();
  const googlePlaceId = String(place.googlePlaceId || '').trim() || null;
  if (!name || !googlePlaceId) {
    skipped += 1;
    continue;
  }

  const categoriesRaw = Array.isArray(place.category)
    ? place.category.map((c) => String(c || '').trim()).filter(Boolean)
    : String(place.category || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
  const categories = categoriesRaw.map(titleCaseCategory);
  const primaryCategory = categories[0] || '';
  const normalizedName = normalizePlaceName(name);
  const latitude = typeof place.latitude === 'number' ? place.latitude : null;
  const longitude = typeof place.longitude === 'number' ? place.longitude : null;
  const docId = stablePlaceDocId(googlePlaceId, normalizedName, latitude, longitude);
  const ref = doc(coll, docId);
  const existing = dryRun ? { exists: () => false } : await getDoc(ref);

  const base = {
    name,
    normalizedName,
    googlePlaceId,
    category: primaryCategory,
    categories,
    googleCategories: categoriesRaw.map((c) => c.toLowerCase()),
    description: String(place.description || '').trim(),
    latitude,
    longitude,
    googleMapsUrl:
      String(place.googleMapsShareURL || place.googleMapsUrl || '').trim() || null,
    photoUrl: String(place.photoURL || '').trim() || null,
    rating: null,
    phoneNumber: '',
    websiteUri: '',
    address: String(place.address || '').trim() || '',
    locality: String(place.sourceAreaLabel || 'Heraklion').trim() || 'Heraklion',
    source: SOURCE,
    status: 'active',
    needsReview: true,
    reviewStatus: 'new',
    lastMatchedTitle: name,
    promotedToLocalGemId: null,
    curatedScope: String(place.curatedScope || '').trim() || 'area',
    importFile: 'greece_heraklion.json',
    updatedAt: serverTimestamp(),
  };

  if (existing.exists()) {
    batch.set(
      ref,
      {
        ...base,
        alternateTitles: arrayUnion(name),
      },
      { merge: true }
    );
    updated += 1;
  } else {
    batch.set(ref, {
      ...base,
      usageCount: 1,
      firstSeenAt: serverTimestamp(),
      alternateTitles: [name],
    });
    created += 1;
  }

  ops += 1;
  if (ops >= BATCH_SIZE) await flush();
}

await flush();

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun,
      created,
      updated,
      skipped,
      total: created + updated,
    },
    null,
    2
  )
);
