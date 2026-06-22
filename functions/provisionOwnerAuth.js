const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { requirePlatformAdminOrManagingAgent, normalizeAdminEmail } = require("./platformAdmin");

function authErrorMessage(error) {
  const code = String(error?.code || "");
  if (code === "auth/email-already-exists") {
    return "That email is already used by another login. Use a different email or update the existing Firebase Auth user in Console.";
  }
  if (code === "auth/invalid-email") {
    return "Invalid email address.";
  }
  if (code === "auth/weak-password") {
    return "Password is too weak. Use at least 6 characters.";
  }
  if (code === "auth/invalid-password") {
    return "Invalid password.";
  }
  return error?.message || "Failed to update login credentials.";
}

async function findAuthUser(auth, { authUid, email, previousEmail }) {
  if (authUid) {
    try {
      return await auth.getUser(authUid);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }

  for (const candidate of [email, previousEmail].filter(Boolean)) {
    try {
      return await auth.getUserByEmail(candidate);
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
    }
  }

  return null;
}

async function provisionOwnerAuthHandler(request, firestore, auth) {
  const ownerId = String(request.data?.ownerId || "").trim();
  await requirePlatformAdminOrManagingAgent(request, firestore, ownerId);

  const email = normalizeAdminEmail(request.data?.email);
  const password = String(request.data?.password || "").trim();
  const previousEmail = normalizeAdminEmail(request.data?.previousEmail);
  const status = String(request.data?.status || "active").trim().toLowerCase();
  const disabled = status === "deactive";

  if (!ownerId) {
    throw new HttpsError("invalid-argument", "ownerId is required.");
  }
  if (!email) {
    throw new HttpsError("invalid-argument", "email is required.");
  }

  const ownerRef = firestore.collection("owners").doc(ownerId);
  const ownerSnap = await ownerRef.get();
  if (!ownerSnap.exists) {
    throw new HttpsError("not-found", "Owner profile not found.");
  }

  const ownerData = ownerSnap.data();
  const displayName =
    typeof ownerData.fullName === "string" ? ownerData.fullName.trim() : "";

  let authUser;
  try {
    authUser = await findAuthUser(auth, {
      authUid: ownerData.authUid,
      email,
      previousEmail: previousEmail && previousEmail !== email ? previousEmail : "",
    });
  } catch (error) {
    logger.error("provisionOwnerAuth: lookup failed", { ownerId, error });
    throw new HttpsError("internal", authErrorMessage(error));
  }

  try {
    if (authUser) {
      const update = {
        email,
        disabled,
        ...(displayName ? { displayName } : {}),
      };
      if (password) update.password = password;
      await auth.updateUser(authUser.uid, update);
      await ownerRef.set(
        {
          authUid: authUser.uid,
          authProvisionedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      logger.info("provisionOwnerAuth: updated", {
        ownerId,
        uid: authUser.uid,
        email,
        disabled,
      });
      return { uid: authUser.uid, created: false };
    }

    if (!password) {
      throw new HttpsError(
        "invalid-argument",
        "Password is required when creating a new Vailo Admin login."
      );
    }

    const created = await auth.createUser({
      email,
      password,
      disabled,
      ...(displayName ? { displayName } : {}),
      emailVerified: false,
    });
    await ownerRef.set(
      {
        authUid: created.uid,
        authProvisionedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    logger.info("provisionOwnerAuth: created", {
      ownerId,
      uid: created.uid,
      email,
      disabled,
    });
    return { uid: created.uid, created: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("provisionOwnerAuth: write failed", { ownerId, error });
    throw new HttpsError("internal", authErrorMessage(error));
  }
}

module.exports = { provisionOwnerAuthHandler };
