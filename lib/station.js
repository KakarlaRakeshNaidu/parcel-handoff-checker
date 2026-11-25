import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const cookieName = "parcel_station";
const sessionSeconds = 8 * 60 * 60;
const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff", ...headers }
});
const equal = (a, b) => timingSafeEqual(
  createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest()
);
function signature(expiry, env) {
  return createHmac("sha256", env.DASHBOARD_SESSION_SECRET)
    .update(expiry + ":" + env.DASHBOARD_PASSWORD).digest("base64url");
}
function authorized(request, env, now) {
  const token = (request.headers.get("cookie") || "").split(";")
    .map(s => s.trim()).find(s => s.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
  if (!token) return false;
  const [expiry, mac, extra] = token.split(".");
  return !extra && /^\d+$/.test(expiry) && Number(expiry) > now &&
    Number(expiry) <= now + sessionSeconds * 1000 && !!mac && equal(mac, signature(expiry, env));
}
function cookie(request, value, age) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure}`;
}

export async function handleStation(request, env = process.env, upstream = fetch, now = Date.now()) {
  const url = new URL(request.url);
  const enabled = /^\d+$/.test(env.THINGSPEAK_CHANNEL_ID || "") &&
    !!env.THINGSPEAK_READ_API_KEY && (env.DASHBOARD_PASSWORD || "").length >= 16 &&
    (env.DASHBOARD_SESSION_SECRET || "").length >= 32;
  if (request.method === "GET" && url.searchParams.has("status")) {
    return json({ enabled, channel: enabled ? env.THINGSPEAK_CHANNEL_ID : null,
      authenticated: enabled && authorized(request, env, now) });
  }
  if (!enabled) return json({ error: "The hosted station has not been configured." }, 503);
  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return json({ error: "Method not allowed." }, 405, { Allow: "GET, POST, DELETE" });
  }
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
      return json({ error: "Use this dashboard to sign in." }, 403);
    }
  }
  if (request.method === "DELETE") {
    return json({ signedOut: true }, 200, { "Set-Cookie": cookie(request, "", 0) });
  }
  if (request.method === "POST") {
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return json({ error: "A JSON password request is required." }, 415);
    }
    let body;
    try {
      const text = await request.text();
      if (text.length > 2048) return json({ error: "Request too large." }, 413);
      body = JSON.parse(text);
    } catch { return json({ error: "Invalid sign-in request." }, 400); }
    if (typeof body?.password !== "string" || !equal(body.password, env.DASHBOARD_PASSWORD)) {
      return json({ error: "That station password is incorrect." }, 401);
    }
    const expiry = String(now + sessionSeconds * 1000);
    return json({ channel: env.THINGSPEAK_CHANNEL_ID }, 200,
      { "Set-Cookie": cookie(request, expiry + "." + signature(expiry, env), sessionSeconds) });
  }
  if (!authorized(request, env, now)) return json({ error: "Unlock the station to view live parcel data." }, 401);
  try {
    const feed = new URL(`https://api.thingspeak.com/channels/${env.THINGSPEAK_CHANNEL_ID}/feeds.json`);
    feed.searchParams.set("api_key", env.THINGSPEAK_READ_API_KEY);
    feed.searchParams.set("results", "100");
    const response = await upstream(feed, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return json({ error: "ThingSpeak could not read the station feed. Please try again." }, 502);
    const payload = await response.json();
    if (!Array.isArray(payload?.feeds)) throw new Error("Invalid feed");
    const feeds = payload.feeds.map(row => Object.fromEntries(
      ["entry_id", "created_at", ...Array.from({ length: 7 }, (_, i) => "field" + (i + 1))]
        .map(key => [key, row[key] ?? null])
    ));
    return json({ channel: { id: Number(env.THINGSPEAK_CHANNEL_ID) }, feeds });
  } catch { return json({ error: "The station feed is temporarily unavailable. Please try again." }, 502); }
}
