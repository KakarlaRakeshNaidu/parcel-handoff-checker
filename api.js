import { parseResponse } from "./core.js";

export async function fetchEntries(channel, key, signal, request = fetch) {
  if (!/^\d+$/.test(channel) || Number(channel) <= 0) throw new Error("Enter a valid numeric Channel ID.");
  const url = new URL("https://api.thingspeak.com/channels/" + channel + "/feeds.json");
  url.searchParams.set("results", "100");
  if (key) url.searchParams.set("api_key", key);
  let response;
  try { response = await request(url, { signal, cache: "no-store" }); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Could not reach ThingSpeak. Check your internet connection, then refresh.");
  }
  if (!response.ok) throw new Error("ThingSpeak returned HTTP " + response.status + ". Check your Channel ID and Read API Key.");
  let data;
  try { data = await response.json(); } catch { throw new Error("ThingSpeak returned an unreadable response. Please try again."); }
  return parseResponse(data);
}
