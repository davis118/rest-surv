"""Surveillance.ai backend: the HTTP and WebSocket layer.

Protocol on /ws:
  browser -> server  binary: one JPEG frame
                     text:   {"type": "config", "apron": {"share": 0.35, "max_brightness": 60}}
                             {"type": "reset"}
  server -> browser  text, one per frame:
                     {"w", "h", "ms", "people": [{"id", "label", "black", "box": [x1, y1, x2, y2], "torso",
                                                  "face", "employee"}]}
                     "torso" is the polygon the black share was measured in, [[x, y], ...] in frame
                     pixels (left shoulder, right shoulder, right hip, left hip), or null when the
                     shoulders were not visible and a fixed slice of the box was measured instead.
                     "face" is that person's face box [x1, y1, x2, y2], or null. "employee" is
                     {"id", "name", "score"} when the face matched a registered employee (score: cosine
                     similarity), else null. "label" is the black-torso result only.

REST under /api:
  GET    /api/employees        {"employees": [{"id", "name", "role", "notes", "created_at"}]}
  POST   /api/employees        multipart: image (JPEG), name, optional role, notes and box ("x1,y1,x2,y2"
                               as shares 0-1 of the image: the face to register; the largest if absent)
                               -> 201 with the record, 422 {"detail"} if the name is blank or no face is there
  DELETE /api/employees/{id}   204, or 404
  POST   /api/faces/recognize  multipart: image -> {"faces": [{"box": [x1, y1, x2, y2], "employee"}]}

Run from the project root:  uvicorn backend.main:app --reload --reload-dir backend --port 8000
"""
import asyncio
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .directory import EmployeeDirectory
from .faces import FaceEngine, pick_face
from .session import Session
from .tracker import PersonTracker

FRONTEND_BUILD = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# Sites allowed to call the REST API from a browser, comma-separated. Only needed when
# the page is served from another origin (deployed frontend); "*" allows any.
ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",") if origin.strip()]

app = FastAPI(title="Surveillance.ai")
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["*"], allow_headers=["*"])
tracker = PersonTracker()
face_engine = FaceEngine()
directory = EmployeeDirectory()
# One worker: the models and the tracker are shared, so frames and face requests are processed one at a time.
executor = ThreadPoolExecutor(max_workers=1)


@app.get("/api/health")
async def health():
    return {"ok": True, "device": tracker.device, "faces": face_engine.provider}


async def read_image(upload):
    """The uploaded picture as a BGR array; 422 if it is not one."""
    image = cv2.imdecode(np.frombuffer(await upload.read(), np.uint8), cv2.IMREAD_COLOR) if upload else None
    if image is None:
        raise HTTPException(422, "The image could not be read.")
    return image


def match_json(match):
    return match and {"id": match[0].id, "name": match[0].name, "score": round(match[1], 3)}


@app.get("/api/employees")
async def list_employees():
    return {"employees": [employee.public() for employee in directory.all()]}


@app.post("/api/employees", status_code=201)
async def add_employee(
    image: UploadFile | None = File(None), name: str = Form(""), role: str = Form(""), notes: str = Form(""),
    box: str | None = Form(None),
):
    if not name.strip():
        raise HTTPException(422, "A name is needed.")
    image = await read_image(image)
    h, w = image.shape[:2]
    try:
        pixels = box and [float(v) * size for v, size in zip(box.split(","), (w, h, w, h), strict=True)]
    except ValueError:
        raise HTTPException(422, "The box must be four numbers: x1,y1,x2,y2.")

    def embed_picked():
        face = pick_face(face_engine.detect(image), pixels)
        return face and face_engine.embed(image, face)

    embedding = await asyncio.get_running_loop().run_in_executor(executor, embed_picked)
    if embedding is None:
        raise HTTPException(422, "No face was found there. Face the camera and try again.")
    return directory.add(name.strip(), role.strip(), notes.strip(), embedding).public()


@app.delete("/api/employees/{employee_id}", status_code=204)
async def delete_employee(employee_id: str):
    if not directory.remove(employee_id):
        raise HTTPException(404, "No such employee.")
    return Response(status_code=204)


@app.post("/api/faces/recognize")
async def recognize(image: UploadFile | None = File(None)):
    image = await read_image(image)

    def identify():
        faces = face_engine.detect(image)
        return [{"box": face.box, "employee": match_json(directory.match(face_engine.embed(image, face)))} for face in faces]

    return {"faces": await asyncio.get_running_loop().run_in_executor(executor, identify)}


@app.websocket("/ws")
async def stream(ws: WebSocket):
    await ws.accept()
    loop = asyncio.get_running_loop()
    session = Session(tracker, face_engine, directory)
    await loop.run_in_executor(executor, session.reset)
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                await ws.send_json(await loop.run_in_executor(executor, session.process, msg["bytes"]))
            elif msg.get("text"):
                data = json.loads(msg["text"])
                if data.get("type") == "reset":
                    await loop.run_in_executor(executor, session.reset)
                elif data.get("type") == "config":
                    session.configure(data)
    except WebSocketDisconnect:
        pass


# After `npm run build`, the backend can serve the page on its own (no Vite needed).
if FRONTEND_BUILD.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_BUILD, html=True), name="frontend")
