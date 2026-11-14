# Surveillance.ai

A live restaurant counter from a webcam: how many customers are in the store, who came in, who left, and how many employees are on the floor.

Built for the LLMSoftware x UT Dallas hackathon (Challenge 1).

- **Live demo:** https://rest-surv.vercel.app
- The backend scales to zero when idle, so the first load can sit on "Connecting to the server…" while it starts. It connects on its own.

## What it does

- Shows the webcam at full frame rate, with a box, ID and label drawn over every person.
- Labels each person by how much of their torso is black (employees wear black aprons), judged against the scene's lighting rather than a fixed pixel value.
- Counts customers crossing a door line you place on the picture, and logs every crossing.
- Treats people in black at a counter zone you draw as employees on the floor.
- Lets you register an employee by picking their face from the stream; registered faces are recognised as employees wherever they stand.

## How it is split

| Part | Stack | Job |
|---|---|---|
| `frontend/` | React, TypeScript, Vite | Camera, overlay, door line, counter zone, the four counters, event log, employee registration |
| `backend/` | Python, FastAPI | Vision only: who is in the frame, where, how black their torso is, and whose face it is |

The backend answers "who is where and what are they wearing". The frontend decides what that means for the store.

### Models

| Job | Model |
|---|---|
| People and body keypoints | YOLOv8n-pose (Ultralytics) |
| Stable ID per person | Ultralytics' built-in tracker |
| Employee or customer | No model: black share of the shoulder-to-hip torso, relative to the scene's black and white points |
| Finding faces | SCRFD (InsightFace `buffalo_l`) |
| Recognising faces | ArcFace ResNet-50 (InsightFace `buffalo_l`), matched by cosine similarity |

All models run on the backend's own hardware. No API keys are used anywhere.

### Protocol

One WebSocket, `/ws`, carries the stream:

- Browser to server, binary: one JPEG frame (640 wide). One frame is in flight at a time.
- Browser to server, text: `{"type": "config", "apron": {"share": 0.35, "max_brightness": 60}}` or `{"type": "reset"}`.
- Server to browser, one JSON message per frame:

```json
{"w": 640, "h": 360, "ms": 57,
 "people": [{"id": 3, "label": "customer", "black": 0.13,
             "box": [x1, y1, x2, y2], "torso": [[x, y], ...],
             "face": [x1, y1, x2, y2], "employee": {"id": "...", "name": "Ana", "score": 0.62}}]}
```

REST, for the employee list:

| Call | Does |
|---|---|
| `GET /api/employees` | Lists registered employees |
| `POST /api/employees` | Registers one: multipart `image`, `name`, optional `role`, `notes`, `box` |
| `DELETE /api/employees/{id}` | Removes one |
| `POST /api/faces/recognize` | Finds and identifies the faces in an image |
| `GET /api/health` | Reports which hardware the models are running on |

The full details are in the comment at the top of `backend/main.py`.

## Run locally

Needs Python 3.10+ and Node 20+.

```
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.main:app --reload --reload-dir backend --port 8000
```

In a second terminal:

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and allow the camera. Vite proxies `/ws` and `/api` to the backend, so no settings are needed.

The first backend start downloads the model weights (about 6 MB for the pose model, about 300 MB for the face models).

## Settings

Nothing is required for local development. Two example files list what a deployment needs:

| File | Variable | Meaning |
|---|---|---|
| `frontend/.env.example` | `VITE_BACKEND_URL` | The backend's https origin. Unset locally. |
| `.env.example` | `ALLOWED_ORIGINS` | Sites allowed to call the REST API from a browser. Defaults to any. |
| `.env.example` | `PORT` | Port the backend listens on. Cloud Run sets it. |

## Deploy

The live demo runs the frontend on Vercel and the backend on Google Cloud Run.

Backend first, so the frontend can be built with its URL. From the project root:

```
gcloud run deploy rest-surv-backend --source . --region us-south1 \
  --allow-unauthenticated --cpu 4 --memory 4Gi --timeout 3600 \
  --max-instances 1 --set-env-vars "ALLOWED_ORIGINS=*"
```

The root `Dockerfile` builds a CPU-only image with the model weights baked in.

Then the frontend, from `frontend/`:

```
vercel link
vercel env add VITE_BACKEND_URL production    # paste the Cloud Run URL
vercel deploy --prod
```

Finally, restrict the backend to the frontend's origin:

```
gcloud run services update rest-surv-backend --region us-south1 \
  --update-env-vars "ALLOWED_ORIGINS=https://your-site.vercel.app"
```

## Limits

- **One viewer at a time.** Every connection shares one tracker, so two people streaming to the same backend disrupt each other's tracking.
- **The employee list is in memory.** It is empty after every backend restart, including each time Cloud Run scales to zero.
- **No GPU on Cloud Run.** Detection runs at about 7 frames a second there, against about 17 on an Apple Silicon laptop. The video stays smooth; the boxes trail further behind.
- **No login.** The deployed backend is open to anyone who has its URL.
- **Dark clothing reads as an apron.** The check measures black fabric on the torso, not aprons specifically.
- **Faces.** Only embeddings and the name, role and notes are kept, never images.
