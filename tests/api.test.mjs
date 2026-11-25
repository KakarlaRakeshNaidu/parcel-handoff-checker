import test from "node:test";
import assert from "node:assert/strict";
import { fetchEntries } from "../api.js";

const signal = () => new AbortController().signal;
test("requests only the selected read endpoint and encodes the Read key", async () => {
  let requested;
  await fetchEntries("3585570", "read+key&test", signal(), async (url, options) => {
    requested = url;
    assert.equal(options.cache, "no-store");
    assert.equal(options.method, undefined);
    return { ok: true, json: async () => ({ feeds: [] }) };
  });
  assert.equal(requested.origin, "https://api.thingspeak.com");
  assert.equal(requested.pathname, "/channels/3585570/feeds.json");
  assert.equal(requested.searchParams.get("api_key"), "read+key&test");
  assert.equal(requested.searchParams.get("results"), "100");
});
test("public channels do not send an empty API key", async () => {
  await fetchEntries("9", "", signal(), async url => {
    assert.equal(url.searchParams.has("api_key"), false);
    return { ok: true, json: async () => ({ feeds: [] }) };
  });
});
test("handles API rejection without displaying generated live data", async () => {
  for (const status of [400, 401, 404, 429, 500]) {
    await assert.rejects(fetchEntries("1", "", signal(), async () => ({ ok: false, status })), /HTTP/);
  }
});
test("network errors are understandable", async () => {
  await assert.rejects(fetchEntries("1", "", signal(), async () => { throw new TypeError("Failed to fetch"); }), /internet connection/);
});
test("timeouts remain distinguishable from connectivity errors", async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(fetchEntries("1", "", abort.signal, async () => { throw abort.signal.reason; }), { name: "AbortError" });
});
test("malformed JSON and API error payloads fail visibly", async () => {
  await assert.rejects(fetchEntries("1", "", signal(), async () => ({
    ok: true, json: async () => { throw new SyntaxError(); }
  })), /unreadable/);
  await assert.rejects(fetchEntries("1", "", signal(), async () => ({
    ok: true, json: async () => -1
  })), /Read API Key/);
});
test("invalid channel IDs are rejected before a request", async () => {
  for (const channel of ["abc", "1/path", "0", "-1", ""]) {
    await assert.rejects(fetchEntries(channel, "", signal(), async () => { throw new Error("Should not request"); }), /numeric/);
  }
});
