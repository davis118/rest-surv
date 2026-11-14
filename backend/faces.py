"""Faces: where they are (SCRFD), whose they are (ArcFace), and which tracked person each belongs to."""
import os
import time
from dataclasses import dataclass

import numpy as np
import onnxruntime
from insightface.app import FaceAnalysis
from insightface.utils import face_align

from .settings import (
    FACE_DETECT_EVERY,
    FACE_DETECT_SIZE,
    FACE_MIN_CONFIDENCE,
    FACE_MODEL,
    FACE_MODEL_ROOT,
    FACE_PICK_REACH,
    FACE_RECHECK_AFTER,
    FORGET_AFTER,
    KEYPOINT_CONFIDENCE,
)

# COCO keypoint indices of the head points used to tell overlapping people apart.
NOSE, LEFT_EYE, RIGHT_EYE = 0, 1, 2


@dataclass(frozen=True)
class Face:
    box: tuple[int, int, int, int]  # x1, y1, x2, y2 in pixels
    landmarks: np.ndarray           # eyes, nose, mouth corners: 5 x (x, y)

    @property
    def center(self):
        x1, y1, x2, y2 = self.box
        return (x1 + x2) / 2, (y1 + y2) / 2


class FaceEngine:
    """The two face models. Shared by the whole app; call it from one thread at a time."""

    def __init__(self):
        # CoreML on a Mac; plain CPU elsewhere (a Linux server has no CoreML).
        available = onnxruntime.get_available_providers()
        models = FaceAnalysis(
            name=FACE_MODEL,
            root=os.path.expanduser(FACE_MODEL_ROOT),
            allowed_modules=["detection", "recognition"],
            providers=[p for p in ("CoreMLExecutionProvider", "CPUExecutionProvider") if p in available],
        )
        models.prepare(ctx_id=0, det_size=(FACE_DETECT_SIZE, FACE_DETECT_SIZE), det_thresh=FACE_MIN_CONFIDENCE)
        self.detector = models.det_model
        self.embedder = models.models["recognition"]
        self.provider = self.detector.session.get_providers()[0]

    def detect(self, image):
        """Every face in a BGR image."""
        h, w = image.shape[:2]
        boxes, landmarks = self.detector.detect(image, max_num=0)
        faces = []
        for (x1, y1, x2, y2, _), points in zip(boxes.tolist(), landmarks):
            faces.append(Face((max(0, int(x1)), max(0, int(y1)), min(w, int(x2)), min(h, int(y2))), points))
        return faces

    def embed(self, image, face):
        """Unit-length identity embedding of one face: the dot product of two is their cosine similarity."""
        embedding = self.embedder.get_feat(face_align.norm_crop(image, face.landmarks)).ravel()
        return embedding / np.linalg.norm(embedding)


def pick_face(faces, box=None):
    """The face a registration means: the nearest to box (x1, y1, x2, y2 in pixels), else the largest.

    None if there is no face, or none within reach of the box.
    """
    if box is None:
        return max(faces, key=lambda f: (f.box[2] - f.box[0]) * (f.box[3] - f.box[1]), default=None)
    x1, y1, x2, y2 = box
    center = np.array([(x1 + x2) / 2, (y1 + y2) / 2])
    face = min(faces, key=lambda f: np.linalg.norm(center - f.center), default=None)
    reach = FACE_PICK_REACH * max(x2 - x1, y2 - y1)
    return face if face is not None and np.linalg.norm(center - face.center) <= reach else None


def faces_by_track(faces, tracks):
    """Which face is whose: {track id: face}.

    A face belongs to a person whose box contains its centre; where several do,
    to the one whose nose and eye keypoints are nearest.
    """
    nearest = {}  # track id -> (distance, face)
    for face in faces:
        cx, cy = face.center
        inside = [t for t in tracks if t.box[0] <= cx <= t.box[2] and t.box[1] <= cy <= t.box[3]]
        if inside:
            distance, track = min(((_head_distance(t, face), t) for t in inside), key=lambda pair: pair[0])
            if track.id not in nearest or distance < nearest[track.id][0]:
                nearest[track.id] = distance, face
    return {track_id: face for track_id, (_, face) in nearest.items()}


def _head_distance(track, face):
    head = [point[:2] for point in (track.keypoints[i] for i in (NOSE, LEFT_EYE, RIGHT_EYE)) if point[2] >= KEYPOINT_CONFIDENCE]
    return float(np.linalg.norm(np.mean(head, axis=0) - face.center)) if head else float("inf")


@dataclass
class TrackFace:
    box: tuple[int, int, int, int] | None = None  # where the face was at the last detection
    employee_id: str | None = None
    score: float = 0.0
    checked: float = float("-inf")                # when the face was last compared with the directory
    seen: float = 0.0


class FaceIdentifier:
    """One browser's memory of each track's face and identity.

    Faces are detected every few frames. A face is only embedded while its track is
    unidentified, at most once per FACE_RECHECK_AFTER; a match then stays with the
    track for as long as that employee is registered.
    """

    def __init__(self, engine, directory):
        self.engine = engine
        self.directory = directory
        self.tracks = {}  # track id -> TrackFace
        self.frames = 0

    def update(self, frame, tracks):
        """Returns {track id: (face box or None, employee match or None)} for the people in this frame."""
        now = time.monotonic()
        found = faces_by_track(self.engine.detect(frame), tracks) if tracks and self.frames % FACE_DETECT_EVERY == 0 else None
        self.frames += 1
        result = {}
        for track in tracks:
            state = self.tracks.setdefault(track.id, TrackFace())
            state.seen = now
            employee = self.directory.get(state.employee_id)
            if employee is None:
                state.employee_id = None  # never matched, or deleted since
            if found is not None:
                face = found.get(track.id)
                state.box = face.box if face else None
                if face and employee is None and self.directory and now - state.checked >= FACE_RECHECK_AFTER:
                    state.checked = now
                    match = self.directory.match(self.engine.embed(frame, face))
                    if match:
                        employee, state.score = match
                        state.employee_id = employee.id
            result[track.id] = state.box, employee and {"id": employee.id, "name": employee.name, "score": round(state.score, 3)}
        for track_id in [i for i, state in self.tracks.items() if now - state.seen > FORGET_AFTER]:
            del self.tracks[track_id]
        return result

    def reset(self):
        self.tracks.clear()
        self.frames = 0
