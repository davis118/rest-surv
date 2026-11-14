"""Employee or customer, by how much of the torso is apron black.

Clothing only: recognising registered employees by face is separate (faces.py).
"""
import time
from collections import deque
from dataclasses import dataclass

import cv2
import numpy as np

from .settings import APRON_MAX_BRIGHTNESS, APRON_MAX_CHROMA, APRON_SHARE, FORGET_AFTER, SMOOTH_FRAMES
from .torso import torso_polygon

EMPLOYEE = "employee"
CUSTOMER = "customer"


@dataclass(frozen=True)
class ApronRule:
    share: float = APRON_SHARE                  # black share needed to be an employee
    max_brightness: int = APRON_MAX_BRIGHTNESS  # black is this dark or darker, 0-255 across the scene's range

    @classmethod
    def from_dict(cls, data):
        return cls(
            share=min(1.0, max(0.0, float(data.get("share", APRON_SHARE)))),
            max_brightness=min(255, max(0, int(data.get("max_brightness", APRON_MAX_BRIGHTNESS)))),
        )


def black_share(frame, track, cutoff):
    """Share of the torso that is black (no lighter than the cutoff, and not coloured), 0 to 1.

    Also returns the polygon it was measured in: None when the shoulders are not
    visible and a fixed chest-to-waist slice of the box was measured instead.
    """
    polygon = torso_polygon(track, frame.shape[1], frame.shape[0])
    if polygon is None:
        x1, y1, x2, y2 = track.box
        w, h = x2 - x1, y2 - y1
        region = frame[y1 + int(h * 0.30): y1 + int(h * 0.65), x1 + int(w * 0.25): x2 - int(w * 0.25)]
        mask = None
    else:
        outline = np.array(polygon, np.int32)
        x, y, w, h = cv2.boundingRect(outline)
        region = frame[y: y + h, x: x + w]
        mask = cv2.fillPoly(np.zeros((h, w), np.uint8), [outline - (x, y)], 255)
    if region.size == 0:
        return 0.0, polygon
    lab = cv2.cvtColor(region, cv2.COLOR_BGR2LAB).astype(np.float32)  # L*, a, b; neutral grey is a = b = 128
    chroma = cv2.magnitude(lab[..., 1] - 128, lab[..., 2] - 128)
    dark = cv2.inRange(cv2.merge([lab[..., 0], chroma]), (0, 0), (cutoff, APRON_MAX_CHROMA))
    return cv2.mean(dark, mask)[0] / 255, polygon


class RoleClassifier:
    """Labels each track from its black share, averaged over recent frames."""

    def __init__(self):
        self.rule = ApronRule()
        self.shares = {}     # track id -> recent black shares
        self.last_seen = {}  # track id -> time last seen

    def set_rule(self, rule):
        if rule.max_brightness != self.rule.max_brightness:
            self.shares.clear()  # old shares were measured against the old black level
        self.rule = rule

    def classify(self, frame, track, light):
        """Returns (label, black share, torso polygon or None) for one tracked person."""
        share, torso = black_share(frame, track, light.cutoff(self.rule.max_brightness))
        shares = self.shares.setdefault(track.id, deque(maxlen=SMOOTH_FRAMES))
        shares.append(share)
        self.last_seen[track.id] = time.monotonic()
        black = sum(shares) / len(shares)
        return (EMPLOYEE if black > self.rule.share else CUSTOMER), black, torso

    def forget_stale(self):
        now = time.monotonic()
        for track_id in [i for i, seen in self.last_seen.items() if now - seen > FORGET_AFTER]:
            del self.last_seen[track_id]
            self.shares.pop(track_id, None)

    def reset(self):
        self.shares.clear()
        self.last_seen.clear()
