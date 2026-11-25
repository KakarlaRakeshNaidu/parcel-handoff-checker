import { mkdir, copyFile } from "node:fs/promises";

const assets = ["index.html", "style.css", "app.js", "core.js", "api.js", "sw.js",
  "setup.html", "setup.js", "thingspeak/parcel_email_alert.m"];
await mkdir("dist/thingspeak", { recursive: true });
for (const file of assets) await copyFile(file, "dist/" + file);
console.log("Built dashboard assets in dist");
