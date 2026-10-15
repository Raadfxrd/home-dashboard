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

## Open it

- At home: http://192.168.2.4:3000
- Anywhere on the tailnet: http://<nas-tailscale-name>:3000

Change the port with `DASHBOARD_PORT` in `.env`.

## Updating

From the Mac: `git -C /Volumes/Projects/home-dashboard pull`, then `sudo sh deploy.sh` on the NAS again.
