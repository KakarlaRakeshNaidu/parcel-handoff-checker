import test from "node:test";
import assert from "node:assert/strict";
import { handleStation } from "../lib/station.js";

const env = { THINGSPEAK_CHANNEL_ID: "3585570", THINGSPEAK_READ_API_KEY: "private-test-key" };
const request = (method = "GET", query = "") => new Request("https://parcel.example/api/station" + query, { method });
const feed = feeds => async () => Response.json({ channel: { api_key: "private metadata" }, feeds });

test("live status requires only channel and Read key, without a password", async () => {
  const response = await handleStation(request("GET", "?status=1"), env);
  assert.deepEqual(await response.json(), { enabled: true, channel: "3585570", startAfterEntry: 5 });
  assert.equal((await handleStation(request(), {})).status, 503);
  assert.equal((await handleStation(request(), { ...env, THINGSPEAK_CHANNEL_ID: "bad" })).status, 503);
});
test("visitors can read live data without cookies and credentials remain server-only", async () => {
  const response = await handleStation(request("GET", "?channel=999"), env, async url => {
    assert.equal(url.pathname, "/channels/3585570/feeds.json");
    assert.equal(url.searchParams.get("api_key"), env.THINGSPEAK_READ_API_KEY);
    return Response.json({ channel: { api_key: "private metadata" }, feeds: [
      { entry_id: 6, created_at: "2026-11-25T11:00:00Z", field1: "1", status: "private metadata" }
    ] });
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  const body = await response.json();
  assert.equal(body.feeds[0].entry_id, 6);
  assert.equal(body.feeds[0].status, undefined);
  assert.deepEqual(body.channel, { id: 3585570 });
  assert.ok(!JSON.stringify(body).includes(env.THINGSPEAK_READ_API_KEY));
});
test("historical test entries are excluded while new ESP32 entries remain", async () => {
  const response = await handleStation(request(), env, feed([
    { entry_id: 1 }, { entry_id: 4 }, { entry_id: 5 }, { entry_id: 6 }, { entry_id: 7 }
  ]));
  assert.deepEqual((await response.json()).feeds.map(row => row.entry_id), [6, 7]);
  const empty = await handleStation(request(), env, feed([{ entry_id: 5 }]));
  assert.deepEqual((await empty.json()).feeds, []);
});
test("other channels retain their data and support an explicit starting entry", async () => {
  const other = { ...env, THINGSPEAK_CHANNEL_ID: "123" };
  const response = await handleStation(request(), other, feed([{ entry_id: 1 }]));
  assert.equal((await response.json()).feeds.length, 1);
  const cutoff = await handleStation(request(), { ...other, THINGSPEAK_START_AFTER_ENTRY: "10" }, feed([{ entry_id: 10 }, { entry_id: 11 }]));
  assert.deepEqual((await cutoff.json()).feeds.map(row => row.entry_id), [11]);
});
test("public endpoint is read-only and does not accept login or cloud writes", async () => {
  for (const method of ["POST", "DELETE", "PUT"]) {
    const response = await handleStation(request(method), env, () => { throw Error("Should not fetch"); });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET");
  }
});
test("upstream failures do not reveal credentials or secret URLs", async () => {
  for (const upstream of [async () => { throw Error("api_key=" + env.THINGSPEAK_READ_API_KEY); },
    async () => new Response("Unavailable", { status: 503 }), async () => Response.json({})]) {
    const response = await handleStation(request(), env, upstream);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes(env.THINGSPEAK_READ_API_KEY));
  }
});
