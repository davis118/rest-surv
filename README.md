# Surveillance.ai

A live restaurant counter from a webcam: customers in store, who came in, who left, and employees on the floor.

- `frontend/` — React + TypeScript (Vite). Shows the camera at full frame rate with an overlay, and owns the door line, counter zone, counters and event log.
- `backend/` — Python (FastAPI). Vision only: tracks people (YOLOv8n-pose), measures how black each torso is against the scene's lighting, and recognises registered employees by face (InsightFace SCRFD + ArcFace).

## Run locally

```
python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.main:app --reload --reload-dir backend --port 8000

cd frontend && npm install && npm run dev
```

Open http://localhost:5173 and allow the camera. Vite proxies `/ws` and `/api` to the backend.

## Deploy

- Backend: the root `Dockerfile` builds a CPU image for Cloud Run. Set `ALLOWED_ORIGINS` to the frontend's origin.
- Frontend: build `frontend/` with `VITE_BACKEND_URL` set to the backend's https origin.

The employee database is in memory: it is empty after every backend restart.

## Protocol

See the comment at the top of `backend/main.py`.
