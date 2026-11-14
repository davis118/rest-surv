"""Person detection, pose and tracking (YOLO pose + the Ultralytics built-in tracker)."""
from dataclasses import dataclass

import torch
from ultralytics import YOLO

from .settings import MODEL_NAME


@dataclass(frozen=True)
class Track:
    id: int
    box: tuple[int, int, int, int]  # x1, y1, x2, y2 in pixels
    keypoints: tuple[tuple[float, float, float], ...]  # 17 COCO points: x, y in pixels, confidence

    @property
    def center(self):
        x1, y1, x2, y2 = self.box
        return (x1 + x2) / 2, (y1 + y2) / 2

    @property
    def feet(self):
        x1, _, x2, y2 = self.box
        return (x1 + x2) / 2, y2


def pick_device():
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class PersonTracker:
    """Gives every person in the frame a box, body keypoints and a stable ID."""

    def __init__(self):
        self.model = YOLO(MODEL_NAME)
        self.device = pick_device()

    def track(self, frame):
        h, w = frame.shape[:2]
        res = self.model.track(frame, persist=True, verbose=False, device=self.device)[0]
        if res.boxes.id is None:
            return []
        tracks = []
        rows = zip(res.boxes.xyxy.tolist(), res.boxes.id.int().tolist(), res.keypoints.data.tolist())
        for box, track_id, keypoints in rows:
            x1, y1, x2, y2 = (int(v) for v in box)
            box = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
            tracks.append(Track(track_id, box, tuple(tuple(point) for point in keypoints)))
        return tracks

    def reset(self):
        """Forget all tracks so IDs start again at 1."""
        predictor = getattr(self.model, "predictor", None)
        for tracker in getattr(predictor, "trackers", None) or []:
            tracker.reset()
