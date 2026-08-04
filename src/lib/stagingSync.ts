import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';

export type TriggerStagingDatabaseSyncResult = {
  ok: boolean;
  actionsUrl: string;
};

export async function triggerStagingDatabaseSyncCallable(): Promise<TriggerStagingDatabaseSyncResult> {
  const fn = httpsCallable<Record<string, never>, TriggerStagingDatabaseSyncResult>(
    cloudFunctions,
    'triggerStagingDatabaseSync'
  );
  const res = await fn({});
  return res.data;
}

export const STAGING_SYNC_ACTIONS_URL =
  'https://github.com/paschalisvlachos/vailo/actions/workflows/sync-staging-from-production.yml';

export const STAGING_ADMIN_URL = 'https://vailo-staging.web.app/admin';
