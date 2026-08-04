/**
 * Creates or resets a Firebase Auth login on vailo-staging and links it to an owners doc.
 * Use when prod→staging auth clone failed or you need a known password on staging.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./vailo-staging-key.json \
 *   STAGING_LOGIN_EMAIL=you@example.com \
 *   STAGING_LOGIN_PASSWORD='YourPassword123!' \
 *   npm run provision:staging-login
 */
import 'dotenv/config';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const email = String(process.env.STAGING_LOGIN_EMAIL || process.env.STAGING_ADMIN_EMAIL || '')
  .trim()
  .toLowerCase();
const password = String(process.env.STAGING_LOGIN_PASSWORD || process.env.STAGING_ADMIN_PASSWORD || '').trim();
const role = String(process.env.STAGING_LOGIN_ROLE || 'admin').trim().toLowerCase();

if (!email || !password) {
  console.error('Set STAGING_LOGIN_EMAIL and STAGING_LOGIN_PASSWORD (min 6 characters).');
  process.exit(1);
}

if (password.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}

const db = getFirestore();
const auth = getAuth();

async function findOwnerByEmail(targetEmail) {
  const snap = await db.collection('owners').where('email', '==', targetEmail).limit(1).get();
  if (!snap.empty) {
    return snap.docs[0];
  }

  const rawSnap = await db.collection('owners').where('email', '==', targetEmail.trim()).limit(1).get();
  if (!rawSnap.empty) {
    return rawSnap.docs[0];
  }

  return null;
}

async function upsertAuthUser({ userEmail, userPassword, displayName }) {
  try {
    const existing = await auth.getUserByEmail(userEmail);
    await auth.updateUser(existing.uid, {
      password: userPassword,
      displayName: displayName || existing.displayName,
      disabled: false,
      emailVerified: true,
    });
    return existing.uid;
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    const created = await auth.createUser({
      email: userEmail,
      password: userPassword,
      displayName: displayName || undefined,
      emailVerified: true,
      disabled: false,
    });
    return created.uid;
  }
}

async function main() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'vailo-staging';
  console.log(`Provisioning staging login on ${projectId} for ${email}…`);

  const ownerDoc = await findOwnerByEmail(email);
  const uid = await upsertAuthUser({
    userEmail: email,
    userPassword: password,
    displayName: ownerDoc?.data()?.fullName,
  });

  if (ownerDoc) {
    await ownerDoc.ref.set(
      {
        authUid: uid,
        email,
        authProvisionedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    console.log(`Linked Auth user to existing owner profile (${ownerDoc.id}, role: ${ownerDoc.data()?.role || 'unknown'}).`);
  } else {
    const ref = db.collection('owners').doc(`staging_login_${uid.slice(0, 8)}`);
    await ref.set({
      fullName: email.split('@')[0],
      email,
      role: role === 'owner' ? 'owner' : 'admin',
      status: 'active',
      authUid: uid,
      authProvisionedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    console.log(`Created owner profile (${ref.id}, role: ${role}).`);
  }

  console.log('');
  console.log('Done. Sign in at https://vailo-staging.web.app/admin');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: (the value you set in STAGING_LOGIN_PASSWORD)`);
}

main().catch((error) => {
  console.error('Provision failed:', error);
  process.exitCode = 1;
});
