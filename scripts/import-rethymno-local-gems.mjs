/**
 * Replace Area Local Gems for Rethymno with json/greece_rethymno.json.
 *
 * 1) Deletes every doc in countries/Greece/areas/{Rethymno}/localGems
 * 2) Imports places from the JSON as local gems
 * 3) Ensures matching localGemsCategories exist (by primary name)
 *
 * Uses the Firebase web client SDK (same pattern as import-heraklion-discovered.mjs).
 * Loads VITE_FIREBASE_* from .env when present.
 *
 * Usage:
 *   node scripts/import-rethymno-local-gems.mjs
 *   node scripts/import-rethymno-local-gems.mjs --dry-run
 *   node scripts/import-rethymno-local-gems.mjs --area-id=Rethymno
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
  getDocs,
  collection,
  collectionGroup,
  writeBatch,
  query,
  where,
  limit,
} = require('firebase/firestore');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const jsonPath = join(root, 'json', 'greece_rethymno.json');

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
const dryRun = process.argv.includes('--dry-run');
const areaIdArg = process.argv.find((a) => a.startsWith('--area-id='))?.slice('--area-id='.length);
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

function stableGemDocId(googlePlaceId, normalizedName, latitude, longitude) {
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

async function resolveRethymnoAreaId() {
  if (areaIdArg) return areaIdArg;

  const directIds = ['rethimno', 'rethymno', 'Rethimno', 'Rethymno'];
  for (const id of directIds) {
    const snap = await getDoc(doc(db, 'countries', country, 'areas', id));
    if (snap.exists()) return id;
  }

  // Fallback: scan areas under Greece
  const areasSnap = await getDocs(collection(db, 'countries', country, 'areas'));
  for (const d of areasSnap.docs) {
    const name = String(d.data()?.name || '');
    if (/Rethymno/i.test(d.id) || /Rethymno/i.test(name)) return d.id;
  }

  // Orphan area docs (no country parent) via collectionGroup
  try {
    const cg = await getDocs(query(collectionGroup(db, 'areas'), limit(500)));
    for (const d of cg.docs) {
      if (d.ref.parent.parent?.id !== country) continue;
      const name = String(d.data()?.name || '');
      if (/Rethymno/i.test(d.id) || /Rethymno/i.test(name)) return d.id;
    }
  } catch (err) {
    console.warn('collectionGroup areas lookup failed:', err?.message || err);
  }

  return null;
}

const places = JSON.parse(readFileSync(jsonPath, 'utf8'));
if (!Array.isArray(places) || places.length === 0) {
  console.error('No places found in', jsonPath);
  process.exit(1);
}

const areaId = await resolveRethymnoAreaId();
if (!areaId) {
  console.error('Could not find a Rethymno area under countries/Greece/areas. Pass --area-id=...');
  process.exit(1);
}

const areaRef = doc(db, 'countries', country, 'areas', areaId);
const areaSnap = await getDoc(areaRef);
if (!areaSnap.exists()) {
  console.error(`Area not found: countries/${country}/areas/${areaId}`);
  process.exit(1);
}

const gemsColl = collection(db, 'countries', country, 'areas', areaId, 'localGems');
const catsColl = collection(db, 'countries', country, 'areas', areaId, 'localGemsCategories');

console.log(
  JSON.stringify(
    {
      projectId,
      path: `countries/${country}/areas/${areaId}/localGems`,
      areaName: areaSnap.data()?.name || areaId,
      inputCount: places.length,
      dryRun,
    },
    null,
    2
  )
);

let batch = writeBatch(db);
let ops = 0;
let deleted = 0;
let created = 0;
let categoriesCreated = 0;
let skipped = 0;

async function flush() {
  if (ops === 0) return;
  if (!dryRun) await batch.commit();
  batch = writeBatch(db);
  ops = 0;
}

// --- 1) Delete existing local gems ---
const existingGems = await getDocs(gemsColl);
console.log(`Existing local gems: ${existingGems.size}`);
for (const d of existingGems.docs) {
  batch.delete(d.ref);
  deleted += 1;
  ops += 1;
  if (ops >= BATCH_SIZE) await flush();
}
await flush();

// --- 2) Ensure categories from JSON ---
const existingCats = await getDocs(catsColl);
const existingCatNames = new Set(
  existingCats.docs.map((d) => String(d.data()?.name || '').trim().toLowerCase()).filter(Boolean)
);

const neededCategories = new Set();
for (const place of places) {
  const raw = Array.isArray(place.category)
    ? place.category
    : String(place.category || '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
  for (const c of raw) {
    const name = titleCaseCategory(c);
    if (name) neededCategories.add(name);
  }
}

for (const name of [...neededCategories].sort()) {
  if (existingCatNames.has(name.toLowerCase())) continue;
  const catRef = doc(catsColl);
  batch.set(catRef, {
    name,
    excludeFromLiveLikeLocal: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: SOURCE,
    importFile: 'greece_rethymno.json',
  });
  categoriesCreated += 1;
  ops += 1;
  if (ops >= BATCH_SIZE) await flush();
}
await flush();

// --- 3) Import gems ---
const nowIso = new Date().toISOString();

for (const place of places) {
  const name = String(place.name || '').trim();
  if (!name) {
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
  const googlePlaceId = String(place.googlePlaceId || '').trim() || null;
  const normalizedName = normalizePlaceName(name);
  const latitude = typeof place.latitude === 'number' ? place.latitude : null;
  const longitude = typeof place.longitude === 'number' ? place.longitude : null;
  const rating =
    typeof place.googleStarRating === 'number'
      ? String(place.googleStarRating)
      : place.googleStarRating != null
        ? String(place.googleStarRating)
        : '';

  const docId = stableGemDocId(googlePlaceId, normalizedName, latitude, longitude);
  const ref = doc(gemsColl, docId);

  batch.set(ref, {
    name,
    description: String(place.description || '').trim(),
    category: primaryCategory,
    categories,
    rating,
    latitude: latitude != null ? String(latitude) : '',
    longitude: longitude != null ? String(longitude) : '',
    googleMapsUrl:
      String(place.googleMapsShareURL || place.googleMapsUrl || '').trim() || '',
    googlePlaceId,
    photoUrl: String(place.photoURL || '').trim() || '',
    address: String(place.address || '').trim() || '',
    isDailyTrip: false,
    suggestedByVailo: true,
    alternateTitles: [],
    curatedScope: String(place.curatedScope || '').trim() || 'area',
    sourceAreaLabel: String(place.sourceAreaLabel || 'Rethymno').trim() || 'Rethymno',
    source: SOURCE,
    importFile: 'greece_rethymno.json',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  created += 1;
  ops += 1;
  if (ops >= BATCH_SIZE) await flush();
}

await flush();

console.log(
  JSON.stringify(
    {
      ok: true,
      dryRun,
      areaId,
      deleted,
      categoriesCreated,
      created,
      skipped,
      totalImported: created,
    },
    null,
    2
  )
);
