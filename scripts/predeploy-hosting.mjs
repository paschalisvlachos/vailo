/**
 * Firebase hosting predeploy hook.
 * Skipped in CI when the workflow already ran `npm run build:staging`.
 */
import { execSync } from 'node:child_process';

if (process.env.CI === 'true' || process.env.SKIP_FIREBASE_PREDEPLOY === '1') {
  console.log('predeploy-hosting: skipping build (CI already built dist/)');
  process.exit(0);
}

execSync('npm run build', { stdio: 'inherit' });
