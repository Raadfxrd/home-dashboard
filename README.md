# home-dashboard

Vue + Express dashboard for weather, Homebridge, media, download activity, and NAS health.

## Quick start

```bash
cp .env.example .env
npm --prefix backend install
npm --prefix frontend install
npm --prefix backend run dev
npm --prefix frontend run dev
```

## ASUSTOR NAS metrics (CPU / RAM / disk / network)

1. In ADM, enable **SNMP service** (Control Center -> Services -> SNMP) and set a community (for v2c).
2. In `.env`, set:
    - `NAS_METRICS_MODE=snmp`
    - `NAS_SNMP_HOST=<your_asustor_ip>`
    - `NAS_SNMP_COMMUNITY=<your_community>`
3. Optional tuning:
    - `NAS_NETWORK_INTERFACES=eth0,bond0` to limit network rows.
    - `NAS_METRICS_CACHE_TTL_MS=5000` to control backend polling cadence (match dashboard 5s refresh).
    - `NAS_METRICS_LOG_ENABLED=true` to print NAS polling logs in backend output.
    - `NAS_METRICS_LOG_VERBOSE=true` to include cache hit/miss debug events.

The dashboard pulls service status every 5s by default, and NAS SNMP responses are cached on the backend to avoid
over-polling.
