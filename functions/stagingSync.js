const { HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const axios = require("axios");
const logger = require("firebase-functions/logger");
const { requirePlatformAdmin } = require("./platformAdmin");

const githubStagingSyncToken = defineSecret("GITHUB_STAGING_SYNC_TOKEN");

const GITHUB_REPO = "paschalisvlachos/vailo";
const WORKFLOW_FILE = "sync-staging-from-production.yml";

async function triggerStagingDatabaseSyncHandler(request, firestore) {
  await requirePlatformAdmin(request, firestore);

  const token = String(githubStagingSyncToken.value() || "").trim();
  if (!token) {
    throw new HttpsError(
      "failed-precondition",
      "GITHUB_STAGING_SYNC_TOKEN is not configured on Cloud Functions."
    );
  }

  try {
    await axios.post(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      { ref: "staging" },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        validateStatus: (status) => status === 204,
      }
    );
  } catch (error) {
    const status = error?.response?.status;
    const detail = error?.response?.data?.message || error?.message || "Unknown error";
    logger.error("triggerStagingDatabaseSync failed", { status, detail });
    throw new HttpsError(
      "internal",
      status === 404
        ? "GitHub workflow not found on the main branch. Merge or copy .github/workflows/sync-staging-from-production.yml into main and push."
        : `Could not start staging sync (${status || "error"}): ${detail}`
    );
  }

  const triggeredBy = String(request.auth?.token?.email || "").trim();
  await firestore.collection("platformSettings").doc("stagingSync").set(
    {
      lastTriggeredAt: new Date().toISOString(),
      lastTriggeredBy: triggeredBy,
      actionsUrl: `https://github.com/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}`,
    },
    { merge: true }
  );

  logger.info("triggerStagingDatabaseSync: started", { triggeredBy });

  return {
    ok: true,
    actionsUrl: `https://github.com/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}`,
  };
}

function registerStagingSync({ firestore, firebaseExports }) {
  const { onCall } = require("firebase-functions/v2/https");

  firebaseExports.triggerStagingDatabaseSync = onCall(
    {
      enforceAppCheck: false,
      secrets: [githubStagingSyncToken],
    },
    async (request) => triggerStagingDatabaseSyncHandler(request, firestore)
  );
}

module.exports = {
  registerStagingSync,
  triggerStagingDatabaseSyncHandler,
  githubStagingSyncToken,
};
