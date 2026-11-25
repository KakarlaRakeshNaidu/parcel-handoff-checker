let template = "";
const channel = document.getElementById("email-channel");
const start = document.getElementById("monitor-from");
const status = document.getElementById("download-status");
try {
  const saved = JSON.parse(sessionStorage.getItem("parcel-connection"));
  if (saved?.channel) channel.value = saved.channel;
} catch {}
start.value = new Date().toISOString().slice(0, 19) + "Z";
try {
  const response = await fetch("./thingspeak/parcel_email_alert.m");
  if (!response.ok) throw new Error();
  template = await response.text();
  document.getElementById("analysis-preview").textContent = template;
} catch {
  document.getElementById("analysis-preview").textContent = "Open thingspeak/parcel_email_alert.m from your project folder.";
  document.getElementById("download-analysis").disabled = true;
}
document.getElementById("download-analysis").onclick = () => {
  if (!/^\d+$/.test(channel.value) || Number(channel.value) <= 0) {
    status.textContent = "Enter a valid numeric Channel ID.";
    channel.focus();
    return;
  }
  start.value = new Date().toISOString().slice(0, 19) + "Z";
  const source = template.replace("channelID = 3585570;", "channelID = " + channel.value + ";")
    .replace("REPLACE_WITH_UTC_START_TIME", start.value);
  const url = URL.createObjectURL(new Blob([source], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "parcel_email_alert.m"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status.textContent = "Downloaded. Enter the two API keys in ThingSpeak MATLAB Analysis, save, then enable the rules below.";
};
