# OpenObserve error logs setup

## Test without .env (browser cookies)

1. Open **Performance** in the portal.
2. Paste **jwt** and **sctoken** from Pulse DevTools → Cookies (same as your curl `-b` flags).
3. Click **Test API (all logs, like curl)** — calls `POST /performance/test-search` with `errors_only: false` and your run’s time window.
4. Click a run to load logs (session cookies sent as `X-OpenObserve-Jwt` headers).

Or from terminal (replace JWT and run id):

```bash
curl -s -X POST http://127.0.0.1:8001/performance/test-search \
  -H 'Content-Type: application/json' \
  -d '{"jwt":"YOUR_JWT","sctoken":"YOUR_SCTOKEN","org":"demo","run_id":1,"errors_only":false}'
```

---

## Permanent setup — `backend/.env` (never commit)

```env
OPENOBSERVE_BASE_URL=https://pulse.salescode.ai
OPENOBSERVE_ORG=demo
OPENOBSERVE_STREAM=channelkart
OPENOBSERVE_JWT=<paste jwt cookie value from Pulse>
OPENOBSERVE_SCTOKEN=<optional, sctoken cookie value>

# Optional
OPENOBSERVE_ORG_MAP=demo:demo,uat:uat,prod:prod
OPENOBSERVE_MAX_HITS=500
OPENOBSERVE_TIME_BUFFER_SECONDS=30
OPENOBSERVE_TIMEOUT_SECONDS=120
OPENOBSERVE_ERROR_SQL_EXTRA=
```

Portal LOB **name** must match the `lob` field in Pulse logs (e.g. `demounnati`).

Restart the backend after changing `.env`.
