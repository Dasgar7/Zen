import crypto from "node:crypto";

type RequestLike = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  query?: Record<string, any>;
};

type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (value: unknown) => unknown;
  end?: () => unknown;
};

export type SubscriptionRecord = {
  plan: "free" | "pro" | "ultra";
  status: string;
  renewDate: string;
  endsAt?: string;
  lemonSubId?: string;
  variantId?: string;
  customerPortalUrl?: string;
  updatePaymentMethodUrl?: string;
  cancelAtPeriodEnd?: boolean;
  lastEventId?: string;
  updatedAt?: string;
};

type AuthenticatedUser = {
  uid: string;
  email?: string;
  name?: string;
};

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "jovial-paratext-slsxp";
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "ai-studio-genex-c7d4be55-95ab-42e1-b1e0-41627b73da24";
const SUBSCRIPTIONS_COLLECTION = "zenSubscriptions";
const localSubscriptions = new Map<string, SubscriptionRecord>();
let cachedAccessToken: { value: string; expiresAt: number } | null = null;

function headerValue(req: RequestLike, name: string): string | undefined {
  const value = req.headers?.[name] ?? req.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function parseBody(req: RequestLike): Record<string, any> {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString("utf8")); } catch { return {}; }
  }
  return typeof req.body === "object" ? req.body as Record<string, any> : {};
}

function json(res: ResponseLike, status: number, body: unknown): unknown {
  return res.status(status).json(body);
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getServiceAccount(): { clientEmail: string; privateKey: string } | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
    return { clientEmail: parsed.client_email, privateKey: parsed.private_key.replace(/\\n/g, "\n") };
  } catch (error) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getFirestoreAccessToken(): Promise<string> {
  const serviceAccount = getServiceAccount();
  if (!serviceAccount) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.clientEmail,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const tokenData = await tokenResponse.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error(`Firebase OAuth token request failed: ${tokenData.error || tokenResponse.status}`);
  cachedAccessToken = { value: tokenData.access_token, expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000 };
  return tokenData.access_token;
}

function firestoreValue(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === "number") return { doubleValue: value };
  return { stringValue: String(value) };
}

function firestoreDocument(record: SubscriptionRecord): Record<string, unknown> {
  return {
    fields: Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined).map(([key, value]) => [key, firestoreValue(value)])),
  };
}

function fromFirestoreValue(value: any): unknown {
  if (!value || typeof value !== "object") return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  return undefined;
}

function fromFirestoreDocument(document: any): SubscriptionRecord | null {
  if (!document?.fields) return null;
  const fields = Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
  if (typeof fields.plan !== "string" || typeof fields.status !== "string") return null;
  return fields as SubscriptionRecord;
}

function firestoreDocumentUrl(uid: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/${SUBSCRIPTIONS_COLLECTION}/${encodeURIComponent(uid)}`;
}

async function firestoreGet(uid: string): Promise<SubscriptionRecord | null> {
  const token = await getFirestoreAccessToken();
  const response = await fetch(firestoreDocumentUrl(uid), { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore read failed: ${response.status} ${await response.text()}`);
  return fromFirestoreDocument(await response.json());
}

async function firestoreSave(uid: string, record: SubscriptionRecord): Promise<void> {
  const token = await getFirestoreAccessToken();
  const response = await fetch(firestoreDocumentUrl(uid), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(firestoreDocument(record)),
  });
  if (!response.ok) throw new Error(`Firestore write failed: ${response.status} ${await response.text()}`);
}

export function defaultSubscription(): SubscriptionRecord {
  return { plan: "free", status: "active", renewDate: "" };
}

export async function getSubscription(uid: string): Promise<SubscriptionRecord> {
  if (!getServiceAccount()) {
    if (isProduction()) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
    return localSubscriptions.get(uid) || defaultSubscription();
  }
  return (await firestoreGet(uid)) || defaultSubscription();
}

export async function saveSubscription(uid: string, record: SubscriptionRecord): Promise<void> {
  localSubscriptions.set(uid, record);
  if (!getServiceAccount()) {
    if (isProduction()) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
    return;
  }
  await firestoreSave(uid, record);
}

async function authenticateUser(req: RequestLike, body: Record<string, any> = {}): Promise<AuthenticatedUser> {
  const authorization = headerValue(req, "authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (token && apiKey) {
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    const data = await response.json() as { users?: Array<{ localId: string; email?: string; displayName?: string }> };
    if (response.ok && data.users?.[0]?.localId) {
      const user = data.users[0];
      return { uid: user.localId, email: user.email, name: user.displayName };
    }
    throw new Error("Firebase authentication token is invalid or expired");
  }
  if (isProduction()) throw new Error("Authorization: Bearer Firebase ID token is required");
  const uid = String(body.userId || "zen_local_test_user");
  return { uid, email: body.userEmail || undefined, name: body.userName || undefined };
}

export async function requireUser(req: RequestLike, res: ResponseLike, body?: Record<string, any>): Promise<AuthenticatedUser | null> {
  try {
    return await authenticateUser(req, body || parseBody(req));
  } catch (error) {
    json(res, isProduction() ? 401 : 400, { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function appUrl(req: RequestLike): string {
  if (process.env.ZEN_APP_URL) return process.env.ZEN_APP_URL.replace(/\/$/, "");
  const forwardedProto = headerValue(req, "x-forwarded-proto") || "https";
  const host = headerValue(req, "x-forwarded-host") || headerValue(req, "host") || "localhost:3000";
  return `${forwardedProto}://${host}`;
}

const variantEnv: Record<string, string> = {
  "pro-monthly": "LEMON_SQUEEZY_PRO_MONTHLY_VARIANT_ID",
  "pro-yearly": "LEMON_SQUEEZY_PRO_YEARLY_VARIANT_ID",
  "ultra-monthly": "LEMON_SQUEEZY_ULTRA_MONTHLY_VARIANT_ID",
  "ultra-yearly": "LEMON_SQUEEZY_ULTRA_YEARLY_VARIANT_ID",
};

export function getVariantId(planKey: string, billingCycle: string): string | null {
  const key = `${planKey}-${billingCycle}`;
  const envName = variantEnv[key];
  const configured = envName ? process.env[envName] : undefined;
  if (configured) return configured;
  return !isProduction() && variantEnv[key] ? `local-${key}` : null;
}

export function planFromVariant(variantId: string | number | undefined): "pro" | "ultra" {
  const id = String(variantId || "");
  return id === process.env.LEMON_SQUEEZY_ULTRA_MONTHLY_VARIANT_ID || id === process.env.LEMON_SQUEEZY_ULTRA_YEARLY_VARIANT_ID ? "ultra" : "pro";
}

function lemonHeaders(): Record<string, string> {
  const apiKey = process.env.LEMON_SQUEEZY_API_KEY;
  if (!apiKey) throw new Error("LEMON_SQUEEZY_API_KEY is not configured");
  return { Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json", Authorization: `Bearer ${apiKey}` };
}

function lemonConfigured(): boolean {
  return Boolean(process.env.LEMON_SQUEEZY_API_KEY && process.env.LEMON_SQUEEZY_STORE_ID);
}

function testMode(): boolean {
  return process.env.LEMON_SQUEEZY_TEST_MODE === "true";
}

export async function createCheckoutHandler(req: RequestLike, res: ResponseLike): Promise<unknown> {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed. Use POST." });
  const body = parseBody(req);
  const user = await requireUser(req, res, body);
  if (!user) return;
  const planKey = body.planKey === "ultra" ? "ultra" : body.planKey === "pro" ? "pro" : "";
  const billingCycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
  const variantId = getVariantId(planKey, billingCycle);
  if (!planKey || !variantId) return json(res, 400, { error: "A valid paid plan and configured Lemon Squeezy variant are required." });

  if (!lemonConfigured()) {
    if (isProduction()) return json(res, 503, { error: "Lemon Squeezy is not configured in this deployment.", code: "LEMON_NOT_CONFIGURED" });
    const simulated: SubscriptionRecord = {
      plan: planKey,
      status: "active",
      renewDate: new Date(Date.now() + (billingCycle === "yearly" ? 365 : 30) * 86_400_000).toISOString(),
      variantId,
      updatedAt: new Date().toISOString(),
    };
    await saveSubscription(user.uid, simulated);
    return json(res, 200, { simulated: true, url: `/?lemon_success=1&plan=${planKey}&cycle=${billingCycle}` });
  }

  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: lemonHeaders(),
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email: user.email || body.userEmail || "",
              custom: { user_id: user.uid, plan: planKey, billing_cycle: billingCycle },
            },
            product_options: {
              enabled_variants: [Number(variantId)],
              redirect_url: `${appUrl(req)}/?lemon_success=1&plan=${planKey}`,
            },
            checkout_options: {
              dark: true,
              button_color: "#48A04C",
              button_text_color: "#ffffff",
              headings_color: "#ffffff",
              primary_text_color: "#f4f4f5",
              secondary_text_color: "#a1a1aa",
              links_color: "#48A04C",
              active_state_color: "#48A04C",
              borders_color: "#3f3f46",
              background_color: "#09090b",
              locale: "en",
            },
            test_mode: testMode(),
          },
          relationships: {
            store: { data: { type: "stores", id: process.env.LEMON_SQUEEZY_STORE_ID } },
            variant: { data: { type: "variants", id: variantId } },
          },
        },
      }),
    });
    const data = await response.json() as any;
    if (!response.ok) return json(res, 502, { error: data?.errors?.[0]?.detail || "Lemon Squeezy rejected the checkout request." });
    const url = data?.data?.attributes?.url;
    if (!url) return json(res, 502, { error: "Lemon Squeezy returned no checkout URL." });
    return json(res, 200, { url, testMode: testMode() });
  } catch (error) {
    console.error("Lemon Squeezy checkout error", error);
    return json(res, 502, { error: error instanceof Error ? error.message : "Unable to create checkout." });
  }
}

function rawRequestBody(req: RequestLike): Buffer {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body, "utf8");
  return Buffer.from(JSON.stringify(req.body || {}), "utf8");
}

function hasAccess(status: string, endsAt?: string): boolean {
  if (status === "active" || status === "on_trial") return true;
  return status === "cancelled" && Boolean(endsAt && Date.parse(endsAt) > Date.now());
}

export async function webhookHandler(req: RequestLike, res: ResponseLike): Promise<unknown> {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed. Use POST." });
  const rawBody = rawRequestBody(req);
  const secret = process.env.LEMON_SQUEEZY_SIGNING_SECRET;
  if (!secret && isProduction()) return json(res, 503, { error: "LEMON_SQUEEZY_SIGNING_SECRET is not configured." });
  if (secret) {
    const signature = headerValue(req, "x-signature") || "";
    const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const expected = Buffer.from(digest, "utf8");
    const received = Buffer.from(signature, "utf8");
    if (!signature || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return json(res, 401, { error: "Invalid webhook signature." });
  }
  try {
    const event = JSON.parse(rawBody.toString("utf8"));
    const eventName = event?.meta?.event_name;
    const customData = event?.meta?.custom_data || {};
    const attributes = event?.data?.attributes || {};
    const userId = String(customData.user_id || "");
    if (!userId) return json(res, 200, { received: true, ignored: "missing custom_data.user_id" });
    const current = await getSubscription(userId);
    const status = String(attributes.status || (eventName === "subscription_cancelled" ? "cancelled" : current.status));
    const endsAt = attributes.ends_at || current.endsAt || undefined;
    const variantId = String(attributes.variant_id || current.variantId || "");
    const plan = eventName === "subscription_expired" || eventName === "subscription_payment_failed" && status !== "active"
      ? "free"
      : hasAccess(status, endsAt) ? (customData.plan === "ultra" ? "ultra" : variantId ? planFromVariant(variantId) : (current.plan === "ultra" ? "ultra" : "pro")) : "free";
    const record: SubscriptionRecord = {
      plan,
      status,
      renewDate: attributes.renews_at || current.renewDate || "",
      endsAt,
      lemonSubId: String(event?.data?.id || current.lemonSubId || "") || undefined,
      variantId: variantId || undefined,
      customerPortalUrl: attributes.urls?.customer_portal || current.customerPortalUrl,
      updatePaymentMethodUrl: attributes.urls?.update_payment_method || current.updatePaymentMethodUrl,
      cancelAtPeriodEnd: Boolean(attributes.cancelled || endsAt),
      lastEventId: `${eventName || "unknown"}:${event?.data?.id || "unknown"}:${attributes.updated_at || ""}`,
      updatedAt: new Date().toISOString(),
    };
    await saveSubscription(userId, record);
    return json(res, 200, { received: true });
  } catch (error) {
    console.error("Lemon Squeezy webhook error", error);
    return json(res, 500, { error: error instanceof Error ? error.message : "Webhook processing failed." });
  }
}

async function fetchLemonSubscription(subscriptionId: string): Promise<any> {
  const response = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, { headers: lemonHeaders() });
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data?.errors?.[0]?.detail || "Unable to retrieve Lemon Squeezy subscription.");
  return data?.data;
}

async function updateLemonSubscription(subscriptionId: string, attributes: Record<string, unknown>, method: "PATCH" | "DELETE" = "PATCH"): Promise<any> {
  const response = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method,
    headers: lemonHeaders(),
    ...(method === "PATCH" ? { body: JSON.stringify({ data: { type: "subscriptions", id: subscriptionId, attributes } }) } : {}),
  });
  const data = await response.json() as any;
  if (!response.ok) throw new Error(data?.errors?.[0]?.detail || "Unable to update Lemon Squeezy subscription.");
  return data?.data;
}

function recordFromLemonData(data: any, current: SubscriptionRecord, forcedPlan?: "pro" | "ultra"): SubscriptionRecord {
  const attributes = data?.attributes || {};
  const status = String(attributes.status || current.status);
  const endsAt = attributes.ends_at || current.endsAt;
  const variantId = String(attributes.variant_id || current.variantId || "");
  return {
    plan: hasAccess(status, endsAt) ? (forcedPlan || (variantId ? planFromVariant(variantId) : current.plan === "ultra" ? "ultra" : "pro")) : "free",
    status,
    renewDate: attributes.renews_at || current.renewDate || "",
    endsAt,
    lemonSubId: String(data?.id || current.lemonSubId || "") || undefined,
    variantId: variantId || undefined,
    customerPortalUrl: attributes.urls?.customer_portal || current.customerPortalUrl,
    updatePaymentMethodUrl: attributes.urls?.update_payment_method || current.updatePaymentMethodUrl,
    cancelAtPeriodEnd: Boolean(attributes.cancelled || endsAt),
    updatedAt: new Date().toISOString(),
  };
}

export async function userSubscriptionHandler(req: RequestLike, res: ResponseLike): Promise<unknown> {
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed. Use GET." });
  const queryId = req.query?.userId;
  const body = { userId: Array.isArray(queryId) ? queryId[0] : queryId };
  const user = await requireUser(req, res, body);
  if (!user) return;
  try {
    return json(res, 200, await getSubscription(user.uid));
  } catch (error) {
    return json(res, 503, { error: error instanceof Error ? error.message : "Subscription storage is unavailable." });
  }
}

export async function manageSubscriptionHandler(req: RequestLike, res: ResponseLike): Promise<unknown> {
  if (req.method !== "GET" && req.method !== "POST") return json(res, 405, { error: "Method not allowed. Use GET or POST." });
  const body = parseBody(req);
  const user = await requireUser(req, res, body);
  if (!user) return;
  try {
    const current = await getSubscription(user.uid);
    if (!current.lemonSubId) return json(res, 200, current);
    if (!lemonConfigured()) return json(res, 503, { error: "Lemon Squeezy is not configured.", code: "LEMON_NOT_CONFIGURED" });
    if (req.method === "GET") {
      const data = await fetchLemonSubscription(current.lemonSubId);
      const refreshed = recordFromLemonData(data, current);
      await saveSubscription(user.uid, refreshed);
      return json(res, 200, refreshed);
    }
    const action = body.action;
    let data: any;
    if (action === "cancel") data = await updateLemonSubscription(current.lemonSubId, {}, "DELETE");
    else if (action === "resume") data = await updateLemonSubscription(current.lemonSubId, { cancelled: false });
    else if (action === "change_plan") {
      const plan = body.planKey === "ultra" ? "ultra" : "pro";
      const cycle = body.billingCycle === "yearly" ? "yearly" : "monthly";
      const variantId = getVariantId(plan, cycle);
      if (!variantId) return json(res, 400, { error: "The requested Lemon Squeezy variant is not configured." });
      data = await updateLemonSubscription(current.lemonSubId, { variant_id: Number(variantId), disable_prorations: true });
    } else return json(res, 400, { error: "Unknown subscription action." });
    const updated = recordFromLemonData(data, current, body.planKey === "ultra" ? "ultra" : body.planKey === "pro" ? "pro" : undefined);
    await saveSubscription(user.uid, updated);
    return json(res, 200, updated);
  } catch (error) {
    console.error("Lemon Squeezy subscription management error", error);
    return json(res, 502, { error: error instanceof Error ? error.message : "Subscription management failed." });
  }
}

export function getRequestBody(req: RequestLike): Record<string, any> {
  return parseBody(req);
}
