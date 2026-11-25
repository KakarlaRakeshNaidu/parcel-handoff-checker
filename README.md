# Parcel Handoff Checker

Live dashboard: https://parcel-handoff-checker.vercel.app/

An ESP32 project that verifies whether a parcel reaches its intended tray.
An entry sensor starts a handoff, a rotary encoder selects Tray A or B, and
two tray sensors confirm the destination. ThingSpeak stores the results;
this dashboard shows activity and flags wrong or unconfirmed deliveries.

## Features

- Correct, wrong-tray and unconfirmed parcel counts
- Expected and detected tray, handoff duration and recent activity
- In-dashboard alerts, acknowledgments and optional sound/desktop notifications
- Public live dashboard that opens automatically without a password
- Server-side ThingSpeak access; channel Read key stays private
- Cloud email alerts through ThingSpeak MATLAB Analysis, React and TimeControl

## Run locally

Use Node.js 22. No third-party packages are required.

```sh
cp .env.example .env
# Fill in the values in .env, then:
node server.mjs
```

Open `http://localhost:4173`. On Windows, `Start Dashboard.cmd` starts the server.
The dashboard opens directly in live mode. Configure the ThingSpeak channel and
Read API Key in `.env`; no dashboard password or browser setup is needed.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `THINGSPEAK_CHANNEL_ID` | The ESP32's ThingSpeak channel |
| `THINGSPEAK_READ_API_KEY` | Server-only channel Read key |

`.env` is ignored by Git. `.env.example` contains placeholders only. The build
copies a fixed list of public assets into `dist`; it does not embed environment
values. The public station API accepts read-only GET requests without signing in.
The API key is never returned to the browser. Feed responses are not cached.

The ESP32 Write API Key belongs in its firmware. The Alerts API Key belongs in
the private ThingSpeak analysis. Neither is needed by the deployed dashboard.

## Deploy to Vercel

1. Import this repository as a Vercel project using the **Other** framework preset.
2. Keep the repository root as the root directory. `vercel.json` sets the build
   command to `node build.mjs` and output directory to `dist`.
3. Add the channel and Read API Key variables above to the Production environment. Use private values
   from your local `.env`; do not commit that file.
4. Deploy, then open the HTTPS URL. Live data loads automatically.

Vercel runs `api/station.js` as a Node.js function. The function reads only the
configured channel. The dashboard and its sanitized feed are public; visitors
do not need a password. No cloud write endpoint is exposed.

The dashboard displays the latest 100 entries already stored in ThingSpeak and
continues to show new ESP32 uploads. Existing cloud history is not filtered out.
Counts are shown as reported by the ESP32 and restart when the board resets.
Dashboard-generated demo data and demo controls are removed.

## ThingSpeak field map

| Field | Value |
| --- | --- |
| 1 | Correct-route count |
| 2 | Wrong-tray count |
| 3 | Unconfirmed count |
| 4 | Last outcome: 0 ready, 1 correct, 2 wrong, 3 unconfirmed |
| 5 | Expected tray: 0 none, 1 A, 2 B |
| 6 | Detected tray: 0 none, 1 A, 2 B |
| 7 | Last handoff duration in milliseconds |

The dashboard polls every 15 seconds. Each cloud row is a snapshot, which may
include several parcel results. Alerts compare counter increases; they do not
invent individual tray details when several results were batched. Counts restart
when the ESP32 resets. An idle feed does not necessarily mean the board is offline.

## Email alerts and testing

Open the dashboard's **Email alert setup** page for the MATLAB template and cloud
rules. Email runs in ThingSpeak and works independently of the dashboard page.
On 25 November 2026, labeled cloud test entry #5 produced a dashboard alert and
ThingSpeak marked its email **sent**. Repeating the analysis did not resend it.
The live dashboard opens without sign-in and displays the existing ThingSpeak history.
No simulated results are generated in the dashboard.

```sh
node --test tests/*.test.mjs
node build.mjs
```

See `TESTING.txt` for verification details and limitations. Physical wiring and
Arduino IDE flashing are separate from deployment testing.

UI refinement used the unslop method by Damir Sokolovsky, licensed CC BY 4.0:
https://heydamir.design/unslop. The interface remains plain HTML, CSS and JavaScript.
