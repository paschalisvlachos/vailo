/**
 * Lists properties/bookings with preArrivalComplete in Firestore.
 * Uses Firebase CLI login token (token is not printed).
 *
 * Usage:
 *   node scripts/find-completed-checkins.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node scripts/find-completed-checkins.mjs
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'vailoapp-497113';

class CliAccessTokenCredential {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }
  getAccessToken() {
    return Promise.resolve({ access_token: this.accessToken, expires_in: 3600 });
  }
}

function initAdmin() {
  if (getApps().length) return;

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    initializeApp({
      credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))),
      projectId,
    });
    return;
  }

  const token = execSync('npx --yes firebase-tools@latest login:print-access-token', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

  initializeApp({
    projectId,
    credential: new CliAccessTokenCredential(token),
  });
}

initAdmin();
const db = getFirestore();

const props = await db.collection('properties').get();
const results = [];

for (const propDoc of props.docs) {
  const prop = propDoc.data();
  const typesSnap = await propDoc.ref.collection('propertyTypes').get();
  for (const typeDoc of typesSnap.docs) {
    const typeData = typeDoc.data();
    for (const b of typeData.syncedBookings || []) {
      if (b.preArrivalComplete) {
        results.push({
          propertyId: propDoc.id,
          propertyName: prop.propertyName || '(unnamed)',
          urlSlug: prop.urlSlug || null,
          typeId: typeDoc.id,
          unitName: typeData.propertyTypeName || '(unit)',
          bookingId: b.id,
          start: b.start,
          end: b.end,
          guestName: b.guestName || b.summary || '',
          submittedAt: b.preArrivalSubmittedAt || null,
        });
      }
    }
  }
}

console.log(JSON.stringify({ projectId, count: results.length, results }, null, 2));
