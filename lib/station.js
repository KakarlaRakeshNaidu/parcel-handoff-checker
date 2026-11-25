const json = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers }
});

export async function handleStation(request, env = process.env, upstream = fetch) {
  const url = new URL(request.url);
  const enabled = /^[1-9]\d*$/.test(env.THINGSPEAK_CHANNEL_ID || "") && !!env.THINGSPEAK_READ_API_KEY;
  const startAfterEntry = 0;
  if (request.method !== "GET") return json({ error: "Method not allowed." }, 405, { Allow: "GET" });
  if (url.searchParams.has("status")) {
    return json({ enabled, channel: enabled ? env.THINGSPEAK_CHANNEL_ID : null, startAfterEntry });
  }
  if (!enabled) return json({ error: "The live station has not been configured." }, 503);
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
