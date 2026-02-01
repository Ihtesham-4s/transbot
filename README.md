## FYPPP Phase 1 — Day 1: Auth + RBAC

This repo contains:

- `backend/`: Node.js + Express + MongoDB + JWT auth + role-based access
- `frontend/`: React + Tailwind (modern UI) with login/signup + role-based dashboards

### Prerequisites

- Node.js 18+ (recommended)
- MongoDB (local install or Atlas)

---

## 2) Backend setup (Express)

1. Copy env file and edit values:

```bash
cd backend
copy .env.example .env
```

Set `MONGODB_URI` (example: `mongodb://localhost:27017/warehouse_robot`).

2. Install deps and start:

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:5000`.

### API

- `POST /api/auth/register`  (name, email, password, role)
- `POST /api/auth/login`     (email, password)
- `GET /api/users/me`        (Bearer JWT)

---

## 3) Frontend setup (React)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and talks to the backend at `http://localhost:5000`.

---

## 4) Notes

- JWT stored in `localStorage`
- Role-based redirect:
  - `admin` -> `/admin`
  - `operator` -> `/operator`

