export const outcomes = ["Ready", "Correct route", "Wrong tray", "Unconfirmed"];
export const trayName = (value) => ["—", "Tray A", "Tray B"][value] || "—";

function numeric(value, name) {
  if (value === null || value === undefined || String(value).trim() === "") {
    throw new Error("Missing " + name + ". Enable ThingSpeak Fields 1–7 and upload a parcel result.");
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw new Error("Invalid " + name + " in the channel feed.");
  }
  return number;
}

export function parseFeed(feed) {
  const id = numeric(feed.entry_id, "entry ID");
  const time = Date.parse(feed.created_at);
  if (!id || !Number.isFinite(time)) throw new Error("Invalid timestamp or entry ID in the channel feed.");
  const values = Array.from({ length: 7 }, (_, i) => numeric(feed["field" + (i + 1)], "Field " + (i + 1)));
  if (values[3] > 3 || values[4] > 2 || values[5] > 2) throw new Error("Outcome or tray codes do not match this project.");
  return { id, time, correct: values[0], wrong: values[1], unconfirmed: values[2],
    outcome: values[3], expected: values[4], observed: values[5], elapsed: values[6] };
}

export function parseResponse(payload) {
  if (!payload || !Array.isArray(payload.feeds)) {
    throw new Error("ThingSpeak could not read this channel. Check the Channel ID and Read API Key.");
  }
  const unique = new Map();
  for (const feed of payload.feeds) unique.set(feed.entry_id, parseFeed(feed));
  return [...unique.values()].sort((a, b) => a.id - b.id);
}

export function newAlerts(previous, current) {
  if (!previous || current.id <= previous.id) return [];
  const reset = current.correct < previous.correct || current.wrong < previous.wrong ||
    current.unconfirmed < previous.unconfirmed;
  const base = reset ? { wrong: 0, unconfirmed: 0 } : previous;
  const alerts = [];
  for (const kind of ["wrong", "unconfirmed"]) {
    const increase = current[kind] - base[kind];
    if (increase <= 0) continue;
    const precise = increase === 1 && current.outcome === (kind === "wrong" ? 2 : 3);
    const detail = precise
      ? (kind === "wrong"
        ? "Expected " + trayName(current.expected) + ". Detected " + trayName(current.observed) + "."
        : "Arrival was not confirmed within 10 seconds, or both tray sensors triggered.")
      : "The " + kind + " total increased by " + increase + ". Individual tray details are unavailable.";
    alerts.push({ id: kind + "-" + current.id, entry: current.id, kind, time: current.time,
      title: kind === "wrong" ? "Wrong parcel detected" : "Handoff unconfirmed",
      detail, increase, acknowledged: false });
  }
  return alerts;
}

export function ingest(previous, entries) {
  if (!entries.length) return { latest: previous, alerts: [] };
  if (!previous) return { latest: entries.at(-1), alerts: [] };
  let latest = previous;
  const alerts = [];
  for (const entry of entries) {
    if (entry.id <= latest.id) continue;
    alerts.push(...newAlerts(latest, entry));
    latest = entry;
  }
  return { latest, alerts };
}

export function makeDemo() {
  let correct = 0, wrong = 0, unconfirmed = 0;
  const start = Date.now() - 16 * 60000;
  return Array.from({ length: 16 }, (_, index) => {
    const outcome = index === 5 || index === 11 ? 2 : index === 8 ? 3 : 1;
    if (outcome === 1) correct++;
    if (outcome === 2) wrong++;
    if (outcome === 3) unconfirmed++;
    const expected = index % 2 + 1;
    return { id: index + 1, time: start + index * 60000, correct, wrong, unconfirmed,
      outcome, expected, observed: outcome === 3 ? 0 : outcome === 2 ? 3 - expected : expected,
      elapsed: outcome === 3 ? 10000 : 1200 + (index * 421) % 4000 };
  });
}
