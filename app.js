import { outcomes, trayName, ingest } from "./core.js";
import { fetchHostedEntries, stationStatus } from "./api.js";

const $ = (id) => document.getElementById(id);
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
};
let station = { enabled: false, channel: null, startAfterEntry: 0 };
const mode = "live";
let records = [];
let latest = null;
let alerts = [];
let controller = null;
let timer = null;
let revision = 0;
let busy = false;
let lastSync = null;
let audio = null;
let selectedNotification = storage.get("parcel-notifications", false);
let sound = storage.get("parcel-sound", false);

function namespace() { return "live-channel-" + station.channel + "-after-" + station.startAfterEntry; }
function loadMonitor() {
  alerts = storage.get("parcel-alerts-" + namespace(), []).filter(a => a && a.id && a.title).slice(0, 50);
  latest = storage.get("parcel-cursor-" + namespace(), null);
  if (latest && latest.id <= station.startAfterEntry) latest = null;
  alerts = alerts.filter(a => a.entry > station.startAfterEntry);
}
function saveMonitor() {
  if (mode === "live") {
    storage.set("parcel-alerts-" + namespace(), alerts);
    storage.set("parcel-cursor-" + namespace(), latest);
  }
}
function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
function elapsed(ms) { return ms ? (ms / 1000).toFixed(1) + " s" : "—"; }
function badge(outcome) { return outcome === 2 ? "bad" : outcome === 3 ? "warn" : outcome === 1 ? "good" : "neutral"; }

function toast(title, detail, info = false) {
  const box = document.createElement("article");
  box.className = "toast" + (info ? " info" : "");
  const heading = document.createElement("div");
  heading.className = "toast-header";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Dismiss notification");
  close.onclick = () => box.remove();
  heading.append(strong, close);
  const p = document.createElement("p");
  p.textContent = detail;
  box.append(heading, p);
  $("toast-container").prepend(box);
  while ($("toast-container").children.length > 3) $("toast-container").lastElementChild.remove();
  setTimeout(() => box.remove(), 12000);
}

function prepareAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio) {
      audio ||= new Audio();
      audio.resume().catch(() => {});
    }
  } catch {}
}
function playSound() {
  if (!sound || !audio) return;
  try {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.connect(gain).connect(audio.destination);
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.45);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.45);
  } catch {}
}
async function notify(alert) {
  toast(alert.title, alert.detail);
  playSound();
  if (selectedNotification && "Notification" in window && Notification.permission === "granted") {
    try {
      const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.ready : null;
      if (registration) await registration.showNotification(alert.title, { body: alert.detail, tag: namespace() + "-" + alert.id });
    } catch {
      $("notification-status").textContent = "Browser notification unavailable. In-dashboard alerts are active.";
    }
  }
}
function addAlerts(incoming) {
  const ids = new Set(alerts.map(a => a.id));
  for (const alert of incoming) {
    if (ids.has(alert.id)) continue;
    alerts.unshift(alert);
    ids.add(alert.id);
    notify(alert);
  }
  alerts = alerts.slice(0, 50);
  saveMonitor();
}

function renderAlerts() {
  const unread = alerts.filter(a => !a.acknowledged).length;
  $("nav-count").textContent = unread;
  $("ack-all").disabled = !unread;
  const list = $("alert-list");
  list.replaceChildren();
  if (!alerts.length) {
    const empty = document.createElement("p");
    empty.className = "alert-empty";
    empty.textContent = "No new alerts. We’ll flag wrong-tray deliveries and unconfirmed handoffs as new cloud updates arrive.";
    list.append(empty);
  }
  for (const alert of alerts) {
    const article = document.createElement("article");
    article.className = "alert-item" + (alert.acknowledged ? " acknowledged" : "");
    const h = document.createElement("h3");
    h.textContent = alert.title;
    const p = document.createElement("p");
    p.textContent = alert.detail;
    const meta = document.createElement("div");
    meta.className = "alert-meta";
    const time = document.createElement("span");
    time.textContent = formatTime(alert.time) + " · Entry " + alert.entry;
    const action = document.createElement("button");
    action.className = "text-button";
    action.textContent = alert.acknowledged ? "Acknowledged" : "Acknowledge";
    action.disabled = alert.acknowledged;
    action.onclick = () => { alert.acknowledged = true; saveMonitor(); renderAlerts(); };
    meta.append(time, action);
    article.append(h, p, meta);
    list.append(article);
  }
}

function renderTable() {
  const filter = $("activity-filter").value;
  const visible = [...records].reverse().filter(row => filter === "all" || row.outcome === Number(filter));
  $("activity-body").replaceChildren();
  for (const row of visible.slice(0, 20)) {
    const tr = document.createElement("tr");
    const values = ["#" + row.id, formatTime(row.time), trayName(row.expected), trayName(row.observed),
      outcomes[row.outcome], row.correct + row.wrong + row.unconfirmed, elapsed(row.elapsed)];
    for (const [i, value] of values.entries()) {
      const td = document.createElement("td");
      if (i === 4) {
        const status = document.createElement("span");
        status.className = "table-badge " + badge(row.outcome);
        status.textContent = value;
        td.append(status);
      } else td.textContent = value;
      tr.append(td);
    }
    $("activity-body").append(tr);
  }
  if (!visible.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.className = "empty-cell";
    td.textContent = records.length ? "No updates match this filter." : "Waiting for the first live ESP32 upload. Test entries are excluded.";
    tr.append(td);
    $("activity-body").append(tr);
  }
  $("row-count").textContent = "Showing " + Math.min(20, visible.length) + " of " + visible.length + " updates";
}

function drawChart() {
  const canvas = $("activity-chart");
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width) return;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(bounds.width * ratio);
  canvas.height = Math.round(bounds.height * ratio);
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  const width = bounds.width, height = bounds.height;
  const display = records.slice(-Number($("chart-window").value));
  $("chart-empty").hidden = display.length !== 0;
  if (!display.length) return;
  const bars = display.map(row => {
    const i = records.indexOf(row);
    const before = records[i - 1];
    if (!before) return [0, 0, 0];
    const reset = row.correct < before.correct || row.wrong < before.wrong || row.unconfirmed < before.unconfirmed;
    return ["correct", "wrong", "unconfirmed"].map(key => reset ? row[key] : Math.max(0, row[key] - before[key]));
  });
  const max = Math.max(2, ...bars.map(bar => bar.reduce((a, b) => a + b, 0)));
  const chart = { x: 28, y: 16, w: width - 44, h: height - 48 };
  ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.lineWidth = 1;
  for (let tick = 0; tick <= 2; tick++) {
    const y = chart.y + chart.h * (1 - tick / 2);
    ctx.strokeStyle = "#e9ebee";
    ctx.beginPath(); ctx.moveTo(chart.x, y); ctx.lineTo(width - 8, y); ctx.stroke();
    ctx.fillStyle = "#686c73";
    ctx.fillText(String(Math.round(max * tick / 2)), 6, y + 3);
  }
  const step = chart.w / display.length;
  const bw = Math.min(20, step * 0.55);
  bars.forEach((bar, i) => {
    let y = chart.y + chart.h;
    bar.forEach((value, k) => {
      if (!value) return;
      const h = value / max * chart.h;
      y -= h;
      ctx.fillStyle = ["#39775c", "#bd6a58", "#b99a55"][k];
      ctx.beginPath();
      ctx.roundRect(chart.x + step * i + (step - bw) / 2, y, bw, h, 2);
      ctx.fill();
    });
  });
  const interval = Math.max(1, Math.ceil(display.length / 5));
  display.forEach((row, i) => {
    if (i % interval !== 0) return;
    const time = new Date(row.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    ctx.fillStyle = "#686c73";
    ctx.textAlign = "center";
    ctx.fillText(time, chart.x + step * i + step / 2, height - 8);
  });
}

function render() {
  const total = latest ? latest.correct + latest.wrong + latest.unconfirmed : 0;
  for (const [id, value] of Object.entries({
    "total-value": total, "correct-value": latest?.correct ?? 0, "wrong-value": latest?.wrong ?? 0,
    "unconfirmed-value": latest?.unconfirmed ?? 0
  })) $(id).textContent = value === null || value === undefined ? "—" : value.toLocaleString();
  $("success-value").textContent = total ? Math.round(latest.correct / total * 100) + "%" : "0%";
  $("expected-tray").textContent = trayName(latest?.expected);
  $("observed-tray").textContent = trayName(latest?.observed);
  $("handoff-time").textContent = latest ? elapsed(latest.elapsed) : "—";
  $("entry-number").textContent = latest ? "#" + latest.id : "—";
  $("last-outcome").textContent = latest ? outcomes[latest.outcome] : "Awaiting data";
  $("last-outcome").className = "outcome " + badge(latest?.outcome);
  $("last-handoff").dataset.outcome = latest?.outcome ?? 0;
  $("last-update").textContent = latest ? new Date(latest.time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  $("mode-pill").textContent = "Live · ThingSpeak";
  $("mode-pill").classList.add("live");
  $("connection-copy").textContent = station.enabled
    ? "Channel " + station.channel + " · live ESP32 uploads · refreshes every 15 seconds"
    : "Connecting to the live station…";
  const aged = latest && Date.now() - latest.time > 180000;
  $("feed-health").textContent = busy ? "Checking…" :
    !lastSync ? "Not connected" : aged ? "No recent uploads · board may be idle" : "Feed checked " + formatTime(lastSync);
  renderTable();
  renderAlerts();
  drawChart();
}

async function poll() {
  if (!station.enabled || busy) return;
  const currentRevision = revision;
  busy = true;
  $("refresh").disabled = true;
  controller = new AbortController();
  const timeout = setTimeout(() => controller?.abort(), 10000);
  try {
    const entries = await fetchHostedEntries(controller.signal);
    if (currentRevision !== revision) return;
    const previous = latest || (lastSync ? {
      id: station.startAfterEntry, correct: 0, wrong: 0, unconfirmed: 0
    } : null);
    const result = ingest(entries.length ? previous : null, entries);
    latest = result.latest;
    records = entries;
    addAlerts(result.alerts);
    saveMonitor();
    lastSync = Date.now();
    $("error-banner").hidden = true;
  } catch (error) {
    if (currentRevision !== revision) return;
    $("error-banner").textContent = error.name === "AbortError"
      ? "ThingSpeak took too long to respond. Showing the last received data; we’ll retry automatically."
      : error.message + " Showing the last received data.";
    $("error-banner").hidden = false;
  } finally {
    clearTimeout(timeout);
    if (currentRevision === revision) {
      busy = false;
      $("refresh").disabled = false;
      render();
      timer = setTimeout(poll, 15000);
    }
  }
}
document.querySelectorAll(".close-dialog").forEach(button => button.onclick = () => button.closest("dialog").close());
$("open-alerts").onclick = () => { renderAlerts(); $("alerts-dialog").showModal(); };
$("ack-all").onclick = () => { alerts.forEach(a => a.acknowledged = true); saveMonitor(); renderAlerts(); };
$("activity-filter").onchange = renderTable;
$("chart-window").onchange = drawChart;
$("sound-toggle").checked = sound;
$("sound-toggle").onchange = () => { sound = $("sound-toggle").checked; storage.set("parcel-sound", sound); if (sound) prepareAudio(); };
$("enable-notifications").onclick = async () => {
  if (!("Notification" in window) || !window.isSecureContext || !("serviceWorker" in navigator)) {
    $("notification-status").textContent = "This browser needs HTTPS or localhost and service-worker support. Dashboard alerts are already active.";
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    selectedNotification = permission === "granted";
    storage.set("parcel-notifications", selectedNotification);
    $("notification-status").textContent = selectedNotification
      ? "Desktop notifications enabled while this dashboard monitors the feed."
      : "Notifications are blocked. You can change this in your browser’s site settings.";
  } catch {
    $("notification-status").textContent = "Notification permission could not be requested. Dashboard alerts are active.";
  }
};
$("refresh").onclick = async () => {
  clearTimeout(timer);
  if (!station.enabled) {
    station = await stationStatus();
    if (station.enabled) loadMonitor();
  }
  poll();
};
$("export-csv").onclick = () => {
  const rows = [["Entry", "Timestamp", "Correct", "Wrong", "Unconfirmed", "Last result", "Expected", "Observed", "Handoff ms"],
    ...records.map(r => [r.id, new Date(r.time).toISOString(), r.correct, r.wrong, r.unconfirmed, outcomes[r.outcome], trayName(r.expected), trayName(r.observed), r.elapsed])];
  const csv = rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "parcel-" + mode + "-updates.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
new ResizeObserver(drawChart).observe($("activity-chart").parentElement);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && mode === "live" && !busy) { clearTimeout(timer); poll(); }
});
if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("./sw.js").catch(() => {});
render();
station = await stationStatus();
if (station.enabled) {
  loadMonitor();
  render();
  poll();
} else {
  $("connection-copy").textContent = "Live station unavailable";
  $("error-banner").textContent = "The live feed could not be opened. Refresh to retry, or check the server’s ThingSpeak configuration.";
  $("error-banner").hidden = false;
}
