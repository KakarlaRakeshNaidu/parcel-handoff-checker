import test from "node:test";
import assert from "node:assert/strict";
import { handleStation } from "../lib/station.js";

const env = { THINGSPEAK_CHANNEL_ID: "3585570", THINGSPEAK_READ_API_KEY: "private-test-key",
  DASHBOARD_PASSWORD: "example-test-password-12345", DASHBOARD_SESSION_SECRET: "test-session-secret-that-is-over-32-characters" };
const request = (method = "GET", path = "", headers = {}, body) => new Request("https://parcel.example/api/station" + path,
  { method, headers, ...(body === undefined ? {} : { body }) });
async function login(now = 1000) {
  return handleStation(request("POST", "", { "Content-Type": "application/json", Origin: "https://parcel.example" },
    JSON.stringify({ password: env.DASHBOARD_PASSWORD })), env, undefined, now);
}

test("hosted status exposes no credentials and configuration fails closed", async () => {
  const response = await handleStation(request("GET", "?status=1"), env);
  assert.deepEqual(await response.json(), { enabled: true, channel: "3585570", authenticated: false });
  assert.equal((await handleStation(request(), {})).status, 503);
  assert.equal((await handleStation(request(), { ...env, DASHBOARD_PASSWORD: "short" })).status, 503);
});
test("an unauthenticated reader never calls ThingSpeak", async () => {
  const response = await handleStation(request(), env, () => { throw Error("Should not fetch"); });
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("sign-in rejects incorrect passwords, non-JSON bodies and cross-site requests", async () => {
  assert.equal((await handleStation(request("POST", "", { "Content-Type": "application/json" }, '{"password":"wrong"}'), env)).status, 401);
  assert.equal((await handleStation(request("POST", "", {}, "password=wrong"), env)).status, 415);
  assert.equal((await handleStation(request("POST", "", { Origin: "https://another.example" }, "{}"), env)).status, 403);
  assert.equal((await handleStation(request("POST", "", { "Content-Type": "application/json" }, "{"), env)).status, 400);
});
test("a correct password creates a secure HttpOnly eight-hour session", async () => {
  const response = await login();
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  for (const part of ["HttpOnly", "SameSite=Strict", "Secure", "Max-Age=28800"]) assert.ok(cookie.includes(part));
  assert.ok(!cookie.includes(env.DASHBOARD_PASSWORD));
  const status = await handleStation(request("GET", "?status=1", { Cookie: cookie.split(";")[0] }), env, undefined, 2000);
  assert.equal((await status.json()).authenticated, true);
});
test("the feed proxy reads only the configured channel and returns only parcel fields", async () => {
  const cookie = (await login()).headers.get("set-cookie").split(";")[0];
  let calls = 0;
  const response = await handleStation(request("GET", "?channel=999", { Cookie: cookie }), env, async url => {
    calls++;
    assert.equal(url.pathname, "/channels/3585570/feeds.json");
    assert.equal(url.searchParams.get("api_key"), env.THINGSPEAK_READ_API_KEY);
    return Response.json({ channel: { api_key: "never-return-this" }, feeds: [
      { entry_id: 5, created_at: "2026-11-25T10:21:00Z", field1: "1", status: "private metadata" }
    ] });
  }, 2000);
  const body = await response.json();
  assert.equal(calls, 1);
  assert.equal(body.feeds[0].entry_id, 5);
  assert.equal(body.feeds[0].status, undefined);
  assert.equal(body.channel.api_key, undefined);
  assert.ok(!JSON.stringify(body).includes(env.THINGSPEAK_READ_API_KEY));
});
test("expired, tampered and password-rotated sessions cannot read data", async () => {
  const cookie = (await login()).headers.get("set-cookie").split(";")[0];
  const denied = () => { throw Error("Should not fetch"); };
  assert.equal((await handleStation(request("GET", "", { Cookie: cookie }), env, denied, 28801001)).status, 401);
  assert.equal((await handleStation(request("GET", "", { Cookie: cookie + "tampered" }), env, denied, 2000)).status, 401);
  assert.equal((await handleStation(request("GET", "", { Cookie: cookie }), { ...env, DASHBOARD_PASSWORD: "a-new-password-long-enough" }, denied, 2000)).status, 401);
});
test("upstream errors never return secret URLs to the browser", async () => {
  const cookie = (await login()).headers.get("set-cookie").split(";")[0];
  const response = await handleStation(request("GET", "", { Cookie: cookie }), env,
    () => { throw Error("https://api.thingspeak.com/?api_key=" + env.THINGSPEAK_READ_API_KEY); }, 2000);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(env.THINGSPEAK_READ_API_KEY));
});
test("locking the station removes the cookie and rejects cross-site logout", async () => {
  const response = await handleStation(request("DELETE"), env);
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("set-cookie").includes("Max-Age=0"));
  assert.equal((await handleStation(request("DELETE", "", { Origin: "https://another.example" }), env)).status, 403);
});
