/**
 * Deploy Hosting after a prior build, skipping the firebase.json predeploy rebuild.
 * Usage: node scripts/deployHosting.mjs staging|production
 */
import { execSync } from 'node:child_process';

const target = String(process.argv[2] || '').trim();
const project =
  target === 'staging' ? 'staging' : target === 'production' ? 'production' : '';

if (!project) {
  console.error('Usage: node scripts/deployHosting.mjs staging|production');
  process.exit(1);
}

execSync(`firebase deploy --only hosting --project ${project}`, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SKIP_FIREBASE_PREDEPLOY: '1',
  },
});
