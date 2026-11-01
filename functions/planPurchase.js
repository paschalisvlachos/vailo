const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const { FieldValue } = require("firebase-admin/firestore");
const Stripe = require("stripe");

const resendApiKey = defineSecret("RESEND_API_KEY");
/** Optional — when set, checkout redirects to Stripe; otherwise account is created and invoiced. */
const stripeSecretKey = defineString("STRIPE_SECRET_KEY", { default: "" });
const stripeWebhookSecret = defineString("STRIPE_PLAN_WEBHOOK_SECRET", { default: "" });

const CONTACT_TO = "info@vailo.app";
const CONTACT_FROM = "Vailo Website <contact@vailo.app>";
const ADMIN_LOGIN_PATH = "/admin";

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MAX_COMPANY = 160;
const MAX_VAT = 40;
const MAX_ADDRESS = 200;
const MAX_CITY = 80;
const MAX_POSTAL = 24;
const MAX_COUNTRY = 80;
const MAX_PASSWORD = 128;
const MAX_PROPERTIES = 200;
const BUY_SCALE_MAX = 200;

/** Mirror of src/lib/websiteRoi.ts — keep in sync. */
const PLAN_RATES = {
  solo: { min: 1, max: 1, eur: 49, name: "Solo Host" },
  pro: { min: 2, max: 10, eur: 39, name: "Pro Host" },
  agency: { min: 11, max: 50, eur: 29, name: "Agency" },
  scale: { min: 51, max: null, eur: 24, name: "Scale" },
};

const SCALE_RATE = { startEur: 24, endEur: 19, startAt: 51, endAt: 200 };

function setCors(req, res) {
  const origin = req.get("origin") || "";
  const allowed =
    !origin ||
    /^https:\/\/(www\.)?vailo\.app$/i.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/i.test(origin);
  res.set("Access-Control-Allow-Origin", allowed ? origin || "*" : "https://vailo.app");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "86400");
}

function trim(value, max) {
  return String(value || "").trim().slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[\d\s+\-().]{6,}$/.test(phone);
}

function scalePricePerProperty(n) {
  if (n <= SCALE_RATE.startAt) return SCALE_RATE.startEur;
  if (n >= SCALE_RATE.endAt) return SCALE_RATE.endEur;
  const t = (n - SCALE_RATE.startAt) / (SCALE_RATE.endAt - SCALE_RATE.startAt);
  return SCALE_RATE.startEur + (SCALE_RATE.endEur - SCALE_RATE.startEur) * t;
}

function planPricePerProperty(count) {
  const n = Math.max(1, Math.floor(count));
  if (n >= 51) return scalePricePerProperty(n);
  if (n >= 11) return PLAN_RATES.agency.eur;
  if (n >= 2) return PLAN_RATES.pro.eur;
  return PLAN_RATES.solo.eur;
}

function planAnnualTotal(count) {
  const n = Math.max(1, Math.floor(count));
  return planPricePerProperty(n) * n;
}

function pickPlanId(count) {
  const n = Math.max(1, Math.floor(count));
  if (n >= 51) return "scale";
  if (n >= 11) return "agency";
  if (n >= 2) return "pro";
  return "solo";
}

function assertPlanMatches(planId, propertyCount) {
  const plan = PLAN_RATES[planId];
  if (!plan) return "Invalid plan.";
  const n = Math.floor(propertyCount);
  if (!Number.isFinite(n) || n < 1 || n > MAX_PROPERTIES) {
    return `Property count must be between 1 and ${MAX_PROPERTIES}.`;
  }
  if (n < plan.min) return `${plan.name} starts at ${plan.min} properties.`;
  if (plan.max != null && n > plan.max) {
    return `${plan.name} is limited to ${plan.max} properties.`;
  }
  if (planId === "scale" && n > BUY_SCALE_MAX) {
    return `Scale checkout supports up to ${BUY_SCALE_MAX} properties. Contact us for larger portfolios.`;
  }
  return null;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function publicOrigin(req) {
  const origin = trim(req.get("origin"), 200);
  if (origin && /^https:\/\/(www\.)?vailo\.app$/i.test(origin)) return origin.replace(/\/$/, "");
  if (origin && /^http:\/\/localhost(:\d+)?$/i.test(origin)) return origin.replace(/\/$/, "");
  return "https://vailo.app";
}

function parseCheckoutBody(body) {
  const honeypot = trim(body?.website, 200);
  if (honeypot) return { honeypot: true };

  const planId = trim(body?.planId, 20).toLowerCase();
  const propertyCount = Number(body?.propertyCount);
  const planError = assertPlanMatches(planId, propertyCount);
  if (planError) return { error: planError };

  const expectedPlan = pickPlanId(propertyCount);
  if (planId !== expectedPlan) {
    return {
      error: `For ${Math.floor(propertyCount)} properties the correct plan is ${PLAN_RATES[expectedPlan].name}.`,
    };
  }

  const rawAccountKind = trim(body?.accountKind || body?.role, 20).toLowerCase();
  let accountKind = rawAccountKind === "agent" || rawAccountKind === "agency" ? "agent" : "owner";
  if (!rawAccountKind) {
    accountKind = planId === "agency" || planId === "scale" ? "agent" : "owner";
  }

  const fullName = trim(body?.fullName, MAX_NAME);
  const email = trim(body?.email, MAX_EMAIL).toLowerCase();
  const phone = trim(body?.phone, MAX_PHONE);
  const company = trim(body?.company, MAX_COMPANY);
  const vatNumber = trim(body?.vatNumber, MAX_VAT);
  const billingAddress = trim(body?.billingAddress, MAX_ADDRESS);
  const city = trim(body?.city, MAX_CITY);
  const postalCode = trim(body?.postalCode, MAX_POSTAL);
  const country = trim(body?.country, MAX_COUNTRY);
  const password = String(body?.password || "").slice(0, MAX_PASSWORD);

  if (!fullName || fullName.length < 2) return { error: "Please enter your full name." };
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };
  if (!isValidPhone(phone)) return { error: "Please enter a valid phone number." };
  if (!billingAddress) return { error: "Please enter your billing address." };
  if (!city) return { error: "Please enter your city." };
  if (!postalCode) return { error: "Please enter your postal code." };
  if (!country) return { error: "Please enter your country." };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const annualTotalEur = planAnnualTotal(propertyCount);
  const unitRateEur = planPricePerProperty(propertyCount);

  return {
    payload: {
      planId,
      planName: PLAN_RATES[planId].name,
      propertyCount: Math.floor(propertyCount),
      unitRateEur,
      annualTotalEur,
      accountKind,
      role: accountKind,
      fullName,
      email,
      phone,
      company,
      vatNumber,
      billingAddress,
      city,
      postalCode,
      country,
      password,
      properties: [],
    },
  };
}

async function emailPurchaseNotice(apiKey, purchase, { paid }) {
  const rows = [
    ["Status", paid ? "Paid — account provisioned" : "Registered — payment pending / invoice"],
    ["Plan", `${purchase.planName} (${purchase.planId})`],
    ["Account type", purchase.role === "agent" ? "Agency" : "Property owner"],
    ["Property slots", String(purchase.propertyCount)],
    ["Annual total", `€${Math.round(purchase.annualTotalEur)}`],
    ["Name", purchase.fullName],
    ["Email", purchase.email],
    ["Phone", purchase.phone],
    ["Company", purchase.company || "—"],
    ["VAT", purchase.vatNumber || "—"],
    ["Billing", `${purchase.billingAddress}, ${purchase.postalCode} ${purchase.city}, ${purchase.country}`],
    ["Owner id", purchase.ownerId || "—"],
    ["Note", "Properties are added later from Vailo Admin."],
  ];

  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;font-weight:600;color:#0B4F5C;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 12px;color:#333;">${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px;color:#333;">
      <p style="margin:0 0 16px;font-size:15px;">New self-serve plan purchase from the Vailo website.</p>
      <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${htmlRows}
      </table>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to: [CONTACT_TO],
      reply_to: purchase.email,
      subject: `Plan purchase — ${purchase.fullName} · ${purchase.planName}`,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend ${response.status}: ${body}`);
  }
}

/**
 * Creates owner Auth + CRM record from a paid (or invoice) purchase.
 * Properties are added later from Admin. Password is read from purchase.passwordTemp then deleted.
 */
async function provisionPurchase(firestore, auth, logger, purchaseRef, purchase) {
  if (purchase.ownerId && purchase.status === "provisioned") {
    return { ownerId: purchase.ownerId, propertyIds: purchase.propertyIds || [] };
  }

  const email = purchase.email;
  const password = String(purchase.passwordTemp || "");
  if (!password || password.length < 6) {
    throw new Error("Missing account password for provisioning.");
  }

  // Fail early if email already has a login.
  try {
    await auth.getUserByEmail(email);
    throw new Error("An account with this email already exists. Sign in to admin or use a different email.");
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  const role = purchase.role === "agent" ? "agent" : "owner";
  const ownerPayload = {
    fullName: purchase.fullName,
    email,
    phone: purchase.phone,
    company: purchase.company || "",
    vatNumber: purchase.vatNumber || "",
    billingAddress: purchase.billingAddress,
    city: purchase.city,
    postalCode: purchase.postalCode,
    country: purchase.country,
    notes: `Self-serve ${purchase.planName} · ${role === "agent" ? "Agency" : "Owner"} · ${purchase.propertyCount} properties · €${Math.round(purchase.annualTotalEur)}/yr`,
    role,
    status: "active",
    planId: purchase.planId,
    planPropertyCount: purchase.propertyCount,
    planAnnualEur: purchase.annualTotalEur,
    source: "self_serve_buy",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const ownerRef = await firestore.collection("owners").add(ownerPayload);
  const ownerId = ownerRef.id;

  let authUser;
  try {
    authUser = await auth.createUser({
      email,
      password,
      displayName: purchase.fullName,
      disabled: false,
    });
    await ownerRef.set(
      {
        authUid: authUser.uid,
        authProvisionedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    await ownerRef.delete().catch(() => undefined);
    logger.error("planPurchase: auth create failed", { ownerId, error });
    if (error?.code === "auth/email-already-exists") {
      throw new Error("An account with this email already exists. Sign in to admin or use a different email.");
    }
    throw new Error(error?.message || "Could not create admin login.");
  }

  // Properties are added later from Admin — only create the account here.
  await purchaseRef.set(
    {
      ownerId,
      propertyIds: [],
      status: "provisioned",
      provisionedAt: new Date().toISOString(),
      passwordTemp: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ownerId, propertyIds: [] };
}

function registerPlanPurchase({ firestore, auth, logger, firebaseExports }) {
  firebaseExports.submitPlanCheckout = onRequest(
    {
      region: "us-central1",
      maxInstances: 10,
      cors: false,
      secrets: [resendApiKey],
    },
    async (req, res) => {
      setCors(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }
      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const parsed = parseCheckoutBody(req.body || {});
      if (parsed.honeypot) {
        res.status(200).json({ ok: true });
        return;
      }
      if (parsed.error) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const { payload } = parsed;
      const origin = publicOrigin(req);

      const { password, ...safePayload } = payload;
      const purchaseDoc = {
        ...safePayload,
        passwordTemp: password,
        status: "pending_payment",
        source: "marketing_website",
        userAgent: trim(req.get("user-agent"), 400) || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      let purchaseRef;
      try {
        purchaseRef = await firestore.collection("planPurchases").add(purchaseDoc);
      } catch (err) {
        logger.error("planPurchase Firestore write failed", err);
        res.status(500).json({ error: "Could not start checkout. Please try again." });
        return;
      }

      const purchaseId = purchaseRef.id;
      const stripeKey = String(stripeSecretKey.value() || "").trim();

      // Stripe configured → hosted Checkout; otherwise provision now and invoice manually.
      if (stripeKey) {
        try {
          const stripe = new Stripe(stripeKey);
          const session = await stripe.checkout.sessions.create({
            mode: "payment",
            customer_email: payload.email,
            client_reference_id: purchaseId,
            metadata: {
              purchaseId,
              planId: payload.planId,
              propertyCount: String(payload.propertyCount),
            },
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  unit_amount: Math.round(payload.annualTotalEur * 100),
                  product_data: {
                    name: `Vailo ${payload.planName}`,
                    description: `${payload.propertyCount} ${
                      payload.propertyCount === 1 ? "property" : "properties"
                    } · €${payload.unitRateEur.toFixed(payload.unitRateEur % 1 === 0 ? 0 : 2)} per property per year`,
                  },
                },
              },
            ],
            success_url: `${origin}/buy?purchase=success&id=${encodeURIComponent(purchaseId)}`,
            cancel_url: `${origin}/buy?purchase=cancelled&id=${encodeURIComponent(purchaseId)}`,
          });

          await purchaseRef.set(
            {
              stripeCheckoutSessionId: session.id,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          res.status(200).json({
            ok: true,
            mode: "stripe",
            checkoutUrl: session.url,
            purchaseId,
          });
          return;
        } catch (err) {
          logger.error("planPurchase Stripe session failed", err);
          await purchaseRef.set(
            {
              status: "checkout_failed",
              error: String(err?.message || err),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          res.status(502).json({
            error: "Could not start card payment. Please try again or email info@vailo.app.",
          });
          return;
        }
      }

      // No Stripe secret — activate account and collect payment offline / invoice.
      try {
        const snap = await purchaseRef.get();
        const purchase = snap.data();
        const { ownerId, propertyIds } = await provisionPurchase(
          firestore,
          auth,
          logger,
          purchaseRef,
          purchase
        );
        await purchaseRef.set(
          {
            paymentStatus: "invoice_pending",
            paymentMode: "manual",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        try {
          await emailPurchaseNotice(resendApiKey.value(), {
            ...purchase,
            ownerId,
            propertyIds,
          }, { paid: false });
        } catch (mailErr) {
          logger.error("planPurchase notice email failed", mailErr);
        }

        res.status(200).json({
          ok: true,
          mode: "direct",
          purchaseId,
          ownerId,
          adminPath: ADMIN_LOGIN_PATH,
          message:
            "Your Vailo Admin account is ready. We’ll follow up by email to complete payment.",
        });
      } catch (err) {
        logger.error("planPurchase direct provision failed", err);
        await purchaseRef.set(
          {
            status: "provision_failed",
            error: String(err?.message || err),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        res.status(400).json({
          error: err instanceof Error ? err.message : "Could not create your account.",
        });
      }
    }
  );

  firebaseExports.stripePlanWebhook = onRequest(
    {
      region: "us-central1",
      maxInstances: 10,
      cors: false,
      secrets: [resendApiKey],
    },
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
      }

      const stripeKey = String(stripeSecretKey.value() || "").trim();
      const whSecret = String(stripeWebhookSecret.value() || "").trim();
      if (!stripeKey || !whSecret) {
        res.status(503).send("Stripe not configured");
        return;
      }

      const stripe = new Stripe(stripeKey);
      let event;
      try {
        const signature = req.get("stripe-signature");
        event = stripe.webhooks.constructEvent(req.rawBody, signature, whSecret);
      } catch (err) {
        logger.error("stripePlanWebhook signature failed", err);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
      }

      if (event.type !== "checkout.session.completed") {
        res.status(200).json({ received: true });
        return;
      }

      const session = event.data.object;
      const purchaseId =
        session.metadata?.purchaseId || session.client_reference_id || "";
      if (!purchaseId) {
        logger.error("stripePlanWebhook missing purchaseId");
        res.status(200).json({ received: true });
        return;
      }

      const purchaseRef = firestore.collection("planPurchases").doc(purchaseId);
      const snap = await purchaseRef.get();
      if (!snap.exists) {
        logger.error("stripePlanWebhook purchase missing", { purchaseId });
        res.status(200).json({ received: true });
        return;
      }

      const purchase = snap.data();
      if (purchase.status === "provisioned") {
        res.status(200).json({ received: true });
        return;
      }

      try {
        await purchaseRef.set(
          {
            paymentStatus: "paid",
            paymentMode: "stripe",
            stripePaymentIntentId: session.payment_intent || null,
            paidAt: new Date().toISOString(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        const refreshed = (await purchaseRef.get()).data();
        const { ownerId, propertyIds } = await provisionPurchase(
          firestore,
          auth,
          logger,
          purchaseRef,
          refreshed
        );

        try {
          await emailPurchaseNotice(resendApiKey.value(), {
            ...refreshed,
            ownerId,
            propertyIds,
          }, { paid: true });
        } catch (mailErr) {
          logger.error("stripePlanWebhook notice email failed", mailErr);
        }
      } catch (err) {
        logger.error("stripePlanWebhook provision failed", { purchaseId, err });
        await purchaseRef.set(
          {
            status: "provision_failed",
            error: String(err?.message || err),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      res.status(200).json({ received: true });
    }
  );
}

module.exports = {
  registerPlanPurchase,
  planAnnualTotal,
  planPricePerProperty,
  pickPlanId,
  parseCheckoutBody,
};
