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

## Try the weather animations

Add `?weather=` to the address: `sunny`, `night`, `clear`, `partly`, `clouds`,
`windy`, `fog`, `drizzle`, `rain`, `heavy`, `storm`, `snow` or `sleet`, e.g.
http://192.168.2.4:3000/?weather=storm. Only the animation changes.
`&wind=50` adds wind, `&mm=5` sets how hard it rains, `&time=day|night`
picks the sky. Click "Simulating … ×" to go back.

## Updating

GitHub builds the image whenever `main` changes (Actions tab, "Image",
about 3 minutes). Then on the NAS:

```
cd /volume1/Projects/home-dashboard && sudo sh deploy.sh
```

That downloads the new image and restarts the container, usually within a
minute. Pull the repo on the Mac first only when `docker-compose.nas.yml`,
`deploy.sh` or `.env.example` changed: `git -C /Volumes/Projects/home-dashboard pull`.

`sudo sh deploy.sh --build` still builds on the NAS (10-20 minutes), for
changes that aren't on `main` yet.

The first time, make the package public so the NAS can download it without
signing in: GitHub > your profile > Packages > home-dashboard > Package
settings > Change visibility > Public. It only contains the built app; your
`.env` is never in it.
