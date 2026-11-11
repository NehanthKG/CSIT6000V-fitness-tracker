# FitPilot

AI powered personal fitness and wellness agent for CSIT6000V. FitPilot coordinates workout and meal planning, records progress, and provides exercise feedback for squats, bicep curls, and arm circles.

## Project layout

- `frontend/` - React + TypeScript web application.
- `backend/` - FastAPI API, planning workflow, TACC Qwen client, and local SQLite storage.
- `database/` - SQLite schema and sample exercise/recipe data.
- `Proposal/` - Original course project proposal.
- `Samples/` - Course supplied TACC examples.

## What works in this MVP

- A wellness dashboard with a weekly activity summary, next workout, recent sessions, and meal inspiration.
- Profile preferences for goals, experience, available time, equipment, food preferences, and budget.
- A coordinated workout and meal plan generator. Generated plans remain drafts until you approve and save them.
- Workout logging and a movement journal.
- Browser-side pose feedback for squats, bicep curls, and arm circles using MediaPipe. Video is processed on the device and is not uploaded.
- An AI coach and plan generator configured for the course's TACC Qwen OpenAI-compatible endpoint. Offline starter mode keeps local planning available.

## Run locally

Requirements: Python 3.9+ and Node.js 20+.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal. The API uses SQLite at `database/fitpilot.db` by default and creates it on first start. No account or hosted database credentials are needed for local development.

## TACC Qwen endpoint

The backend calls the OpenAI compatible Qwen endpoint using `QWEN_BASE_URL` and `QWEN_MODEL` (`qwen3.8-27b` by default). TACC's service address is temporary: start the course service, wait for `Application startup complete`, then set `QWEN_BASE_URL` to that run's `SERVICE_BASE_URL` including `/v1`. Never commit a live endpoint URL, SSH key, or TACC credential.

```bash
cd backend
QWEN_BASE_URL='http://NODE:8000/v1' uvicorn app.main:app --reload
```

When the endpoint is not configured or unreachable, plan generation uses a clearly labeled local starter plan so the rest of the app remains usable. See [TACC deployment notes](backend/tacc/README.md) for running the API as a TACC client job.

## Database

Local development uses SQLite. The schema and starter catalog are in `database/schema.sql` and `database/seed.sql`. The current adapter is local SQLite; the schema can be adapted to PostgreSQL/Supabase when hosted auth and persistence are set up.

## Safety

FitPilot gives general wellness suggestions, not medical advice. It asks for user approval before saving generated plans. Exercise video is analyzed in the browser and is not uploaded to the backend.

## Current scope

This is a local, single-profile prototype with no login, cloud sync, or hosted database credentials. TACC model calls only work when the backend has network access to the current service address. See [backend/tacc/README.md](backend/tacc/README.md) for the course sample workflow and its networking limitation.
