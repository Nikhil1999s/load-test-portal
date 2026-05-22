# salescode.ai — Load & Stress Testing Portal

> Built by QA Engineering Team · salescode.ai · v1.0

A self-hosted, enterprise-grade portal for automating API load and stress testing across all Lines of Business (LOBs). No manual scripting required — configure, run, and get professional PDF reports in minutes.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🏢 Multi-LOB support | Manage 60+ Lines of Business with individual credentials and tokens |
| 🔑 Auto token generation | RSA-encrypted signin flow — no manual token pasting |
| ⚡ k6 test execution | Run load tests directly from the browser |
| 🔧 JMeter support | Generate JMX files or upload your own |
| 📈 Progressive testing | 30 → 60 → 120 → 200 VUs, runs sequentially |
| 📥 curl / JSON import | Paste any curl command — portal extracts everything automatically |
| 📄 Enterprise PDF reports | Charts, metric definitions, CONFIDENTIAL watermark |
| 📧 Email notifications | PDF report auto-sent after every test |
| 🔍 Error analysis | HTTP status codes, sample failed requests, smart hints |
| 🎨 salescode.ai branding | #0bacaa teal theme throughout |

---

## 🛠️ Tech Stack

**Frontend:** React 18 · Vite · Tailwind CSS · Axios  
**Backend:** Python 3.11 · FastAPI · SQLAlchemy · Uvicorn  
**Database:** SQLite (file-based, zero config)  
**Test Engines:** k6 v2 · Apache JMeter 5.6  
**PDF:** ReportLab  
**Email:** Gmail SMTP  

---

## 📋 Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.10+ |
| Node.js | 18+ |
| k6 | v2.0+ |
| JMeter | 5.6+ (optional) |
| Docker | Latest (optional) |

---

## ⚡ Quick Start

### Option A — Run locally

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

Open: `http://localhost:3001`

---

### Option B — Docker (recommended)

```bash
# Build and start both containers
docker-compose up --build

# Run in background
docker-compose up --build -d

# Stop
docker-compose down
```

Open: `http://localhost:3001`

> SQLite database is auto-created on first run. No setup needed.

---

## 📁 Project Structure

```
load-test-portal/
├── backend/
│   ├── main.py                    ← FastAPI entry point
│   ├── models.py                  ← 6 database tables
│   ├── database.py                ← SQLite config
│   ├── requirements.txt
│   ├── .env                       ← Gmail credentials (never commit)
│   ├── Dockerfile
│   ├── assets/
│   │   └── logo.png               ← salescode.ai logo for PDF
│   ├── routes/
│   │   ├── lobs.py                ← LOB CRUD + token generation
│   │   ├── apis.py                ← API catalog
│   │   ├── mappings.py            ← LOB ↔ API mapping
│   │   ├── runs.py                ← k6 / JMeter execution + email
│   │   ├── suites.py              ← progressive multi-iteration runs
│   │   ├── reports.py             ← report view + PDF download
│   │   └── thresholds.py          ← pass/fail thresholds
│   ├── generators/
│   │   ├── k6_generator.py        ← auto-generates k6 scripts
│   │   ├── jmx_generator.py       ← auto-generates JMX files
│   │   └── pdf_generator.py       ← enterprise PDF reports
│   └── utils/
│       ├── token_generator.py     ← RSA encryption + signin
│       └── email_sender.py        ← Gmail SMTP + PDF attachment
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── api.js                 ← all API clients
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   └── Header.jsx
│       └── pages/
│           ├── LOBs.jsx           ← Lines of Business management
│           ├── APIs.jsx           ← API library + curl import
│           ├── Mapping.jsx        ← LOB ↔ API mapping
│           ├── TestConfig.jsx     ← test config + run + JMX upload
│           ├── Reports.jsx        ← reports + PDF download
│           └── Docs.jsx           ← portal documentation
├── docker-compose.yml
├── .dockerignore
└── README.md
```

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `lobs` | LOB name, base URL, credentials, Bearer token |
| `apis` | Master API catalog — endpoints, methods, bodies |
| `lob_api_mappings` | Which APIs are active per LOB |
| `lob_thresholds` | Error rate pass/fail threshold per LOB |
| `test_runs` | Individual test results and metrics |
| `test_suites` | Progressive multi-iteration test groups |

> ⚠️ If model changes are made, delete `backend/loadtest.db` and restart to recreate all tables.

---

## 📧 Email Setup

Create `backend/.env` — **never commit this file:**

```env
MAIL_USERNAME=qaautomationsalescode@gmail.com
MAIL_PASSWORD=xxxx xxxx xxxx xxxx
MAIL_FROM=qaautomationsalescode@gmail.com
MAIL_FROM_NAME=salescode.ai Load Test Portal
```

Get App Password: Google Account → Security → 2-Step Verification → App Passwords

---

## 🌐 Team Access (Local Network)

```bash
# Find your machine IP
ifconfig | grep "inet "   # Mac/Linux

# Share with team
http://YOUR_IP:3001
```

---

## 🔒 Security Notes

- `.env` is in `.gitignore` — never commit credentials
- `loadtest.db` is in `.gitignore` — database stays local
- LOB credentials stored in SQLite — encrypt EBS volume on AWS
- No authentication currently — Phase 2 adds Email OTP login

---

## 🗺️ Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| Phase 1 | Full portal — 6 screens, k6/JMeter, PDF, email | ✅ Complete |
| Phase 2 | AWS deployment + Docker | 🔜 In progress |
| Phase 2 | Email OTP login | 🔜 Planned |
| Phase 3 | Scheduled runs | 💡 Built, pending deploy |
| Phase 3 | Diff reports | 💡 Backlog |
| Phase 3 | Parallel LOB testing | 💡 Backlog |

---

## 🚀 Start Commands (Save for daily use)

```bash
# Kill old processes and start fresh
kill $(lsof -ti tcp:8001) 2>/dev/null
kill $(lsof -ti tcp:3001) 2>/dev/null

# Backend
cd /path/to/load-test-portal/backend
python -m uvicorn main:app --reload --port 8001

# Frontend (new terminal)
cd /path/to/load-test-portal/frontend
npm run dev

# Open
http://localhost:3001
```

---

*salescode.ai · Load & Stress Testing Portal · QA Engineering Team*
