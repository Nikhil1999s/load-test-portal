# Load Test Portal — Project Overview

A self-hosted web portal for **API load and stress testing** across many Lines of Business (LOBs). QA teams configure LOBs and APIs in the UI, run **k6** or **JMeter** tests, and get metrics plus PDF reports (optional email).

Built for **salescode.ai** by the QA Engineering Team.

---

## What it does

1. **LOBs** — Store per-LOB base URL, credentials, and auth tokens (including RSA-based auto sign-in).
2. **APIs** — Central catalog of endpoints; import from curl/JSON.
3. **Mapping** — Choose which APIs each LOB tests and with what weight/body.
4. **Test config** — Run k6 or JMeter; progressive suites (e.g. 30 → 60 → 120 → 200 VUs).
5. **Reports** — View results, download PDFs, optional SMTP email after runs.

No hand-written k6/JMX scripts required for the common path — generators build them from stored config.

---

## Architecture

```
Browser (React)  →  /api proxy  →  FastAPI (Python)  →  SQLite
                                        ↓
                              k6 / JMeter (local CLI)
                                        ↓
                              PDF (ReportLab) + Email (SMTP)
```

| Layer | Stack |
|-------|--------|
| Frontend | React 18, Vite, Tailwind, React Router, Axios |
| Backend | FastAPI, SQLAlchemy, Uvicorn |
| Data | SQLite (`backend/loadtest.db`, auto-created) |
| Engines | k6 (primary), Apache JMeter 5.6 (optional) |

**Ports (local dev):**

- Frontend: `http://localhost:3000` (Vite proxies `/api` → backend)
- Backend: `http://localhost:8001`

---

## Repository layout

```
load-test-portalo/
├── backend/
│   ├── main.py              # FastAPI app + CORS + routes
│   ├── models.py            # LOB, API, mapping, threshold, suite, run
│   ├── database.py          # SQLite engine
│   ├── routes/              # REST: lobs, apis, mappings, runs, suites, reports, thresholds
│   ├── generators/          # k6 scripts, JMX, PDF reports
│   └── utils/               # Token (RSA sign-in), email
├── frontend/
│   └── src/
│       ├── App.jsx          # Routes: LOBs, APIs, Mapping, TestConfig, Reports, Docs
│       ├── api.js           # Axios clients
│       └── pages/           # One page per workflow step
├── README.md                # Full setup, features, roadmap
└── docs/PROJECT_OVERVIEW.md # This file
```

---

## Data model (6 tables)

| Table | Role |
|-------|------|
| `lobs` | LOB name, URL, env, auth header / login |
| `apis` | Method, endpoint, default body |
| `lob_api_mappings` | LOB ↔ API links, weights, custom bodies |
| `lob_thresholds` | Pass/fail limits (p90, p99, error %, RPS) |
| `test_suites` | Multi-step progressive runs |
| `test_runs` | Single run config + JSON results |

If you change `models.py`, delete `backend/loadtest.db` and restart the API to recreate tables.

---

## Quick start

**Backend:**

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8001
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

**External tools:** Install [k6](https://k6.io/) on the machine that runs tests. JMeter is optional for JMX-based runs.

**Email (optional):** Create `backend/.env` with Gmail SMTP vars (`MAIL_USERNAME`, `MAIL_PASSWORD`, etc.). Do not commit `.env`.

---

## API surface (high level)

All backend routes are mounted at the FastAPI root; the frontend calls them via `/api/*` proxy.

| Area | Examples |
|------|----------|
| LOBs | CRUD, healthcheck, `POST /lobs/{id}/generate-token` |
| APIs | CRUD |
| Mappings | `GET/POST /mappings/{lob_id}` |
| Runs | Start k6/JMeter, poll status |
| Suites | Progressive multi-VU runs |
| Reports | List runs, download PDF |
| Thresholds | Per-LOB limits |

Health: `GET /health` → `{"status": "healthy"}`.

---

## Security & limitations

- **No login yet** — intended for trusted networks; Phase 2 adds email OTP.
- LOB credentials live in local SQLite — treat the DB and `.env` as sensitive.
- CORS allows `localhost:3000` and `5173` only (see `backend/main.py`).

---

## Related docs

- **[README.md](../README.md)** — Full feature list, Docker notes, email setup, roadmap, team access.
- In-app **Docs** page (`/docs`) — Portal help inside the UI.
