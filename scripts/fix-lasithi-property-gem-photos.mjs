/**
 * Fix missing/broken photos on lasithi area gems synced from properties.
 *
 * Google Places media URLs expire / don't render in admin. This re-resolves
 * each place via getGooglePlaceDetails (returns a Firebase Storage photoUrl)
 * and writes it back onto the area gem.
 *
 * Usage:
 *   node scripts/fix-lasithi-property-gem-photos.mjs
 *   node scripts/fix-lasithi-property-gem-photos.mjs --dry-run
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');
const { getFunctions, httpsCallable } = require('firebase/functions');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

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

function isGooglePlacesPhotoUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (host === 'places.googleapis.com' && path.includes('/photos/') && path.endsWith('/media')) {
      return true;
    }
    if (host.endsWith('.googleusercontent.com') && path.includes('/place-photos/')) {
      return true;
    }
    if (host === 'maps.googleapis.com' && path.startsWith('/maps/api/place/photo')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isFirebaseStoragePhotoUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === 'firebasestorage.googleapis.com' || host === 'storage.googleapis.com';
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
const functions = getFunctions(app, 'us-central1');
const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');

const country = 'Greece';
const areaId = 'lasithi';
const gemsColl = collection(db, 'countries', country, 'areas', areaId, 'localGems');
const snap = await getDocs(gemsColl);

const targets = [];
for (const d of snap.docs) {
  const data = d.data();
  if (!data.sourcePropertyGemId) continue;
  const photo = String(data.photoUrl || '').trim();
  if (!photo || isGooglePlacesPhotoUrl(photo)) {
    targets.push({ id: d.id, name: String(data.name || d.id), data, photo });
  }
}

console.log(
  JSON.stringify(
    {
      projectId,
      dryRun,
      propertySyncedGems: snap.docs.filter((d) => d.data().sourcePropertyGemId).length,
      needingFix: targets.length,
    },
    null,
    2
  )
);

let fixed = 0;
let failed = 0;

for (let i = 0; i < targets.length; i += 1) {
  const { id, name, data, photo } = targets[i];
  const lat = parseFloat(String(data.latitude ?? ''));
  const lng = parseFloat(String(data.longitude ?? ''));

  if (dryRun) {
    console.log(`DRY ${i + 1}/${targets.length}: ${name}`);
    fixed += 1;
    continue;
  }

  try {
    const searchQuery =
      String(data.googleMapsUrl || '').trim() ||
      (Number.isFinite(lat) && Number.isFinite(lng) ? `${lat},${lng}` : name);

    const result = await getGooglePlaceDetails({
      searchQuery,
      area: 'Lasithi',
      fallbackName: name,
      fallbackLat: Number.isFinite(lat) ? lat : undefined,
      fallbackLng: Number.isFinite(lng) ? lng : undefined,
      usageCaller: 'script_fix_lasithi_property_gem_photos',
    });

    const details = result?.data || {};
    const nextPhoto = String(details.photoUrl || '').trim();
    if (!nextPhoto || isGooglePlacesPhotoUrl(nextPhoto)) {
      console.warn(`FAIL no storage photo: ${name}`);
      failed += 1;
      await sleep(400);
      continue;
    }

    const patch = {
      photoUrl: nextPhoto,
      updatedAt: new Date().toISOString(),
      photoFixedAt: new Date().toISOString(),
    };
    if (details.googlePlaceId && !data.googlePlaceId) {
      patch.googlePlaceId = details.googlePlaceId;
    }
    if (details.googleMapsUrl && !String(data.googleMapsUrl || '').includes('google')) {
      patch.googleMapsUrl = details.googleMapsUrl;
    }

    await updateDoc(doc(gemsColl, id), patch);
    fixed += 1;
    console.log(
      `OK ${fixed}/${targets.length}: ${name} (${isFirebaseStoragePhotoUrl(nextPhoto) ? 'storage' : 'other'})`
    );
  } catch (err) {
    failed += 1;
    console.warn(`FAIL ${name}:`, err?.message || err);
  }

  // Gentle pacing for Places API / callables
  await sleep(350);
}

console.log(JSON.stringify({ ok: true, dryRun, fixed, failed, total: targets.length }, null, 2));
