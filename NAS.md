# Running on the NAS

Lives in `/volume1/Projects/home-dashboard` on the Asustor (the `Projects` share).

## First run

1. Fill in `.env` (API keys for OpenWeather, Jellyfin, TMDB, Homebridge, qBittorrent, NZBGet, indexer).
2. In ADM, enable **SNMP** (Services → SNMP, v2c) and put the community in `NAS_SNMP_COMMUNITY`.
3. Turn on SSH (Services → Terminal), then:

   ```sh
   ssh <admin-user>@192.168.2.4
   cd /volume1/Projects/home-dashboard
   sudo sh deploy.sh
   ```

   The first build takes a while on the NAS. After that the containers show up in Portainer
   and restart on their own after a reboot.

## Optional extras

- **Coming up** (this week's episodes and films): add `SONARR_URL`, `SONARR_API_KEY`,
  `RADARR_URL` and `RADARR_API_KEY` to `.env`. Keys are under Settings › General.
- **Containers** in the bottom bar read the Docker socket, mounted read-only.
  `deploy.sh` gives the dashboard the socket's group automatically.
- **Calendar** (agenda under the clock, and what to wear for when you're out):
  create an app-specific password at appleid.apple.com › Sign-In and Security ›
  App-Specific Passwords, then set `ICLOUD_USERNAME` (your Apple ID email) and
  `ICLOUD_APP_PASSWORD` in `.env`. Optionally limit it with
  `CALENDAR_NAMES=Home,Work`. Events with a physical location count as "out".
  Subscribed calendars and Outlook/Google calendars aren't served by iCloud;
  add their .ics links as `CALENDAR_ICS_URLS=School|webcal://…,Work|https://…`.
  The Calendar entry in the bottom bar lists what is being read.

## Open it

- At home: http://192.168.2.4:3000
- Anywhere on the tailnet: http://<nas-tailscale-name>:3000

Change the port with `DASHBOARD_PORT` in `.env`.

## Updating

From the Mac: `git -C /Volumes/Projects/home-dashboard pull`, then `sudo sh deploy.sh` on the NAS again.
