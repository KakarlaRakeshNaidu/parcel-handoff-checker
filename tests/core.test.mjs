import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, parseResponse, newAlerts, ingest, makeDemo } from "../core.js";

function raw(id = 1, changes = {}) {
  return { entry_id: id, created_at: "2026-11-25T10:00:00Z",
    field1: "10", field2: "2", field3: "1", field4: "1", field5: "1",
    field6: "1", field7: "2300", ...changes };
}
function snapshot(id = 1, changes = {}) { return parseFeed(raw(id, changes)); }

test("reads exactly the seven-field Arduino map", () => {
  const row = snapshot();
  assert.deepEqual([row.correct, row.wrong, row.unconfirmed, row.outcome, row.expected, row.observed, row.elapsed],
    [10, 2, 1, 1, 1, 1, 2300]);
});
test("null and absent fields are not converted to zero", () => {
  for (const value of [null, undefined, "", " "]) assert.throws(() => snapshot(1, { field2: value }), /Missing/);
});
test("rejects negative, nonnumeric and fractional counters", () => {
  for (const value of ["-1", "NaN", "a", "Infinity", "1.5"]) assert.throws(() => snapshot(1, { field1: value }), /Invalid/);
});
test("rejects invalid result, tray, timestamp and entry ID", () => {
  for (const change of [{ field4: "4" }, { field5: "3" }, { field6: "5" }, { created_at: "invalid" }, { entry_id: 0 }]) {
    assert.throws(() => parseFeed(raw(1, change)));
  }
});
test("empty channels stay empty and inaccessible feeds fail clearly", () => {
  assert.deepEqual(parseResponse({ feeds: [] }), []);
  assert.throws(() => parseResponse("-1"), /Read API Key/);
});
test("sorts and deduplicates the response by entry ID", () => {
  assert.deepEqual(parseResponse({ feeds: [raw(3), raw(1), raw(3)] }).map(r => r.id), [1, 3]);
});
test("first connection sets a baseline without replaying historical alerts", () => {
  const result = ingest(null, [snapshot(1), snapshot(2, { field2: "3" })]);
  assert.equal(result.latest.id, 2);
  assert.equal(result.alerts.length, 0);
});
test("new wrong result includes the correct expected and observed tray", () => {
  const alerts = newAlerts(snapshot(), snapshot(2, { field2: "3", field4: "2", field5: "1", field6: "2" }));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].detail, /Expected Tray A. Detected Tray B/);
});
test("a later correct result does not hide a wrong count increase", () => {
  const alerts = newAlerts(snapshot(), snapshot(2, { field2: "3", field4: "1", field5: "2", field6: "2" }));
  assert.equal(alerts[0].kind, "wrong");
  assert.match(alerts[0].detail, /Individual tray details are unavailable/);
});
test("batched wrong parcels never invent individual route information", () => {
  const alerts = newAlerts(snapshot(), snapshot(2, { field2: "5", field4: "2" }));
  assert.equal(alerts[0].increase, 3);
  assert.match(alerts[0].detail, /increased by 3/);
});
test("unchanged totals and repeated polls never replay alerts", () => {
  const first = snapshot();
  assert.deepEqual(newAlerts(first, snapshot(2)), []);
  assert.deepEqual(newAlerts(first, first), []);
  assert.deepEqual(ingest(snapshot(2), [snapshot(), snapshot(2)]).alerts, []);
});
test("missing intermediate snapshots still expose counter increases", () => {
  assert.equal(newAlerts(snapshot(), snapshot(25, { field2: "4" }))[0].increase, 2);
});
test("restart resets the baseline and a wrong parcel after reset still alerts", () => {
  assert.deepEqual(newAlerts(snapshot(), snapshot(2, { field1: "0", field2: "0", field3: "0" })), []);
  const alerts = newAlerts(snapshot(), snapshot(2, { field1: "0", field2: "1", field3: "0", field4: "2" }));
  assert.equal(alerts[0].increase, 1);
});
test("unconfirmed increases are distinct alerts", () => {
  const alerts = newAlerts(snapshot(), snapshot(2, { field3: "2", field4: "3", field6: "0", field7: "10000" }));
  assert.equal(alerts[0].kind, "unconfirmed");
  assert.match(alerts[0].detail, /10 seconds/);
});
test("ordered ingest processes multiple arrivals once", () => {
  const rows = [snapshot(2, { field2: "3" }), snapshot(3, { field2: "4" })];
  const result = ingest(snapshot(), rows);
  assert.equal(result.alerts.length, 2);
  assert.equal(result.latest.id, 3);
  assert.equal(ingest(result.latest, rows).alerts.length, 0);
});
test("demo produces a chronological feed with consistent counters", () => {
  const rows = makeDemo();
  rows.forEach((row, index) => {
    assert.equal(row.correct + row.wrong + row.unconfirmed, index + 1);
    if (index) assert.ok(row.time > rows[index - 1].time);
  });
  assert.equal(rows.at(-1).correct, 13);
  assert.equal(rows.at(-1).wrong, 2);
  assert.equal(rows.at(-1).unconfirmed, 1);
});


test("first wrong upload after an observed empty live feed generates an alert", () => {
  const baseline = { id: 5, correct: 0, wrong: 0, unconfirmed: 0 };
  const row = { id: 6, time: Date.now(), correct: 0, wrong: 1, unconfirmed: 0,
    outcome: 2, expected: 1, observed: 2, elapsed: 1200 };
  const result = ingest(baseline, [row]);
  assert.equal(result.alerts.length, 1);
  assert.equal(result.alerts[0].kind, "wrong");
});
