# Load Test Portal

A self-hosted portal for managing multi-LOB API load testing.

---

## Prerequisites

- Python 3.10+
- Node.js 18+

---

## Setup & Run

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend runs at: http://localhost:8000
API docs (Swagger): http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at: http://localhost:3000

---

## Team access (local network)

Find your machine's local IP:
- Mac/Linux: `ifconfig | grep "inet "`
- Windows: `ipconfig`

Share `http://YOUR_IP:3000` with your team — anyone on the same network/VPN can access the portal.

---

## Project structure

```
load-test-portal/
├── backend/
│   ├── main.py           # FastAPI entry point
│   ├── database.py       # SQLite (local) / PostgreSQL (AWS) config
│   ├── models.py         # Database models
│   ├── requirements.txt
│   └── routes/
│       └── lobs.py       # LOB CRUD endpoints
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── api.js        # Axios client
│   │   ├── components/
│   │   │   └── Sidebar.jsx
│   │   └── pages/
│   │       ├── LOBs.jsx        # Screen 1 ✅
│   │       ├── APIs.jsx        # Screen 2 (coming)
│   │       ├── Mapping.jsx     # Screen 3 (coming)
│   │       ├── TestConfig.jsx  # Screen 4 (coming)
│   │       └── Reports.jsx     # Screen 5 (coming)
│   └── vite.config.js
└── README.md
```

---

## Switching to AWS / PostgreSQL later

In `backend/database.py`, the `DATABASE_URL` is read from an environment variable.
Just set it before starting:

```bash
export DATABASE_URL=postgresql://user:password@your-rds-host/loadtest
uvicorn main:app --reload
```

No other code changes needed.

---

## Screens roadmap

| Screen | Status |
|--------|--------|
| LOB management | ✅ Done |
| API library | 🔜 Next |
| LOB ↔ API mapping | 🔜 Upcoming |
| Test config & run | 🔜 Upcoming |
| Reports | 🔜 Upcoming |
