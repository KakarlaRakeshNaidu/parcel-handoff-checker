PARCEL HANDOFF DASHBOARD

Open Start Dashboard.cmd on Windows, then visit http://localhost:4173.
The launcher uses Node.js from your PATH or the Node runtime installed with
Codex. If neither is available, it asks you to install Node.js LTS.
There are no npm packages to install. You can also run "node server.mjs"
from this folder.

The app itself is plain HTML, CSS and JavaScript. It can also be served by
any static web host with HTTPS, preserving this folder's file structure.
Use a local server rather than opening index.html as a file.

GET STARTED
1. The dashboard starts in clearly labeled demo mode.
2. Try Correct delivery, Wrong tray and Timeout. Choose Tray A or B.
3. Open Alerts to acknowledge notifications, enable sound or request
   desktop notifications.
4. For real data, choose Connect ThingSpeak. Enter the channel ID and
   Read API Key from your ThingSpeak channel. Keys are case-sensitive.
5. The browser reads the latest 100 snapshots every 15 seconds. It stores
   the Read key in sessionStorage for this tab. Disconnect with Switch
   to demo. The ESP32 Write API Key belongs only in the Arduino sketch.
6. For cloud email alerts, open Email alert setup in the sidebar.

EMAIL ALERTS
setup.html contains the setup instructions and a configurable download of
thingspeak/parcel_email_alert.m. Configure the Read and Alerts API keys in
ThingSpeak MATLAB Analysis. Enable the React and TimeControl rules there.
Emails go to the account email registered with ThingSpeak. The account
currently allows 2 alerts per 30 minutes, subject to your alert balance.
The browser does not send email or store the Alerts API Key.

The cloud analysis uses a UTC start date, counter increases and the alerts
history to deduplicate accepted notifications. It examines the latest 100
snapshots. Keep these rules enabled and avoid running simultaneous copies
of the analysis. A very long outage that spans more than 100 snapshots can
lose the details of earlier increases. The first row is a baseline; upload
one baseline before testing a wrong parcel after enabling cloud alerts.
Live channel reading was verified in Chrome on 25 November 2026.
The saved cloud analysis is "Parcel wrong-tray email" (analysis 431677).
The Alerts API Key is configured privately in that ThingSpeak analysis.
React 139989 checks Field 2 > 0 on each insertion and runs that analysis.
TimeControl 99690 retries the same analysis every 5 minutes.
On 25 November 2026, labeled test entry #5 triggered a dashboard alert;
ThingSpeak Alerts history marked its email SENT. A repeat analysis run
reported no new counts. Inbox placement has not been independently checked.
The test entry remains in the channel: totals are 1 correct, 2 wrong,
1 unconfirmed until new firmware results update them. See TESTING.txt.

HOW DATA IS INTERPRETED
Field 1 = Correct count       Field 2 = Wrong count
Field 3 = Unconfirmed count   Field 4 = Last result (0/1/2/3)
Field 5 = Expected tray       Field 6 = Observed tray (0/1/2)
Field 7 = Handoff time in milliseconds.

Every table row is a cloud snapshot, not necessarily one parcel.
Your existing Arduino firmware can combine several results in a snapshot.
Alerts track increases in the wrong and unconfirmed counters. If exact
wrong-parcel tray details are unavailable, an alert says so.
First connection establishes a baseline and does not replay old alerts.
Counter decreases are treated as an ESP32 restart. If a reset and new
deliveries occur between polls without any count decreasing, a restart
cannot be identified with these seven fields.
The chart shows count changes between retained snapshots. The first retained
snapshot is a baseline. Refresh does not reset the ESP32.

No recent uploads does not prove the ESP32 is offline. The firmware only
uploads after results. Dashboard readings are labeled accordingly.
An empty channel stays empty and never displays made-up live readings.

ALERTS AND PRIVACY
Demo data never writes to ThingSpeak. Demo and live alerts are separate.
Live alert acknowledgments and the last processed entry are stored locally
in this browser, per channel. Keep a private channel's Read key private;
anyone holding it can read its feed. Clear browser storage on shared PCs.
Desktop notifications need browser permission and HTTPS/localhost.
Notifications from this page need the dashboard running; cloud email works
with the page closed. Sound starts after a user interaction.

TESTS
Run "node --test tests/*.test.mjs" from this folder.
See TESTING.txt for the actual verification performed.

GIT
This folder is a Git repository initialized through WSL (main branch).
API keys belong in the browser connection form or your private ThingSpeak
analysis, not in committed source files. Local environment and secret files
are excluded by .gitignore. No remote repository has been published.
