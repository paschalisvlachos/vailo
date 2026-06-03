const { onCall, HttpsError } = require("firebase-functions/v2/https");
const axios = require("axios");
const {
  getBookingById,
  isBookingPortalAccessAllowed,
} = require("./guestPortalBookingAccess");

const APPLIANCE_MODEL = "gemini-2.5-flash";

async function getSession(firestore, propertyId, sessionId) {
  const snap = await firestore
    .collection("properties")
    .doc(propertyId)
    .collection("guestPortalSessions")
    .doc(sessionId)
    .get();
  if (!snap.exists) return null;
  return { sessionId: snap.id, ...snap.data() };
}

async function requireGuestSession(firestore, propertyId, typeId, sessionId) {
  if (!propertyId || !typeId || !sessionId) {
    throw new HttpsError("invalid-argument", "Missing session parameters.");
  }
  const session = await getSession(firestore, propertyId, sessionId);
  if (!session || session.typeId !== typeId) {
    throw new HttpsError("permission-denied", "Invalid session.");
  }
  if (Date.now() > new Date(session.accessUntil).getTime()) {
    throw new HttpsError("permission-denied", "Session expired.");
  }
  if (session.source === "admin_preview" || session.source === "tester") {
    throw new HttpsError("failed-precondition", "Appliance lookup not available in preview mode.");
  }
  if (!session.bookingId) {
    throw new HttpsError("failed-precondition", "No booking linked to session.");
  }
  const booking = await getBookingById(
    firestore,
    propertyId,
    typeId,
    session.bookingId
  );
  if (!isBookingPortalAccessAllowed(booking)) {
    throw new HttpsError("permission-denied", "Booking access not allowed.");
  }
  return session;
}

/**
 * Gemini + Google Search: grounded operating steps for a specific appliance model.
 */
async function generateApplianceGuideWithSearch(apiKey, payload) {
  const {
    brand = "",
    model = "",
    device = "",
    room = "",
    question = "",
    hostNotes = "",
    locale = "en",
  } = payload;

  const modelLabel = [brand, model].filter(Boolean).join(" ").trim() || device || "appliance";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${APPLIANCE_MODEL}:generateContent`;

  const userPrompt = `The guest asks (${locale}): ${question}

Property appliance:
- Type: ${device || "Appliance"}
- Brand: ${brand || "(see model name)"}
- Model: ${model || "(not specified)"}
- Location: ${room || "see house guide"}

${hostNotes ? `Host notes from the house guide (mention location/supplies if relevant):\n${hostNotes}\n` : ""}

Use Google Search to find the official user manual and reliable instructions for: ${modelLabel}

Write a practical answer for the guest:
- Numbered steps they can follow at the machine (programs, buttons, detergent, door, start).
- Use the same language as the guest question.
- Be confident and specific to this model — do NOT say you lack the manual or only know "general" steps.
- Under 500 words. Add brief safety notes only if important.`;

  const body = {
    systemInstruction: {
      parts: [
        {
          text:
            "You help vacation rental guests operate appliances. Always use Google Search to ground your answer in the real manual for the stated brand and model. Reply in the guest's language.",
        },
      ],
    },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1200,
    },
  };

  const res = await axios.post(url, body, {
    params: { key: apiKey },
    headers: { "Content-Type": "application/json" },
    timeout: 90000,
  });

  const parts = res.data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Empty appliance guide response");
  }
  return text;
}

function registerGuestApplianceGuide({ firestore, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestApplianceGuide requires firebaseExports");
  }

  firebaseExports.getGuestApplianceGuide = onCall(
    {
      timeoutSeconds: 90,
      memory: "512MiB",
      enforceAppCheck: false,
    },
    async (request) => {
      const data = request.data || {};
      const propertyId = String(data.propertyId || "").trim();
      const typeId = String(data.typeId || "").trim();
      const sessionId = String(data.sessionId || "").trim();
      const brand = String(data.brand || "").trim();
      const model = String(data.model || "").trim();
      const device = String(data.device || "").trim();
      const question = String(data.question || "").trim();

      if (!brand && !model) {
        throw new HttpsError(
          "invalid-argument",
          "brand or model is required for appliance lookup."
        );
      }
      if (!question) {
        throw new HttpsError("invalid-argument", "question is required.");
      }

      await requireGuestSession(firestore, propertyId, typeId, sessionId);

      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new HttpsError(
          "failed-precondition",
          "GEMINI_API_KEY is not configured on Cloud Functions."
        );
      }

      const guideText = await generateApplianceGuideWithSearch(apiKey, {
        brand,
        model,
        device,
        room: String(data.room || "").trim(),
        question,
        hostNotes: String(data.hostNotes || "").trim().slice(0, 2000),
        locale: String(data.locale || "en").trim().slice(0, 12) || "en",
      });

      return { guideText, model: APPLIANCE_MODEL };
    }
  );
}

module.exports = { registerGuestApplianceGuide };
