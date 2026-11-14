"""One connected browser: its settings and the per-frame vision pipeline.

The backend only looks at pixels: who is in the frame, where, how black their
torso is, and whether their face is a registered employee's. Door counting and
the counters live in the frontend.
"""
import time

import cv2
import numpy as np

from .faces import FaceIdentifier
from .roles import ApronRule, RoleClassifier
from .scene import SceneLight


class Session:
    def __init__(self, tracker, face_engine, directory):
        self.tracker = tracker
        self.faces = FaceIdentifier(face_engine, directory)
        self.roles = RoleClassifier()
        self.light = SceneLight()

    def configure(self, msg):
        if isinstance(msg.get("apron"), dict):
            self.roles.set_rule(ApronRule.from_dict(msg["apron"]))

    def reset(self):
        """Forget everyone: IDs start again at 1."""
        self.tracker.reset()
        self.roles.reset()
        self.light.reset()
        self.faces.reset()

    def process(self, jpeg):
        """JPEG bytes in; one labelled box, torso outline, face and identity per person out."""
        started = time.perf_counter()
        frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return {"error": "could not decode frame"}
        h, w = frame.shape[:2]

        self.light.update(frame)
        tracks = self.tracker.track(frame)
        faces = self.faces.update(frame, tracks)
        people = []
        for track in tracks:
            label, black, torso = self.roles.classify(frame, track, self.light)
            face, employee = faces[track.id]
            people.append({
                "id": track.id, "label": label, "black": round(black, 3), "box": track.box, "torso": torso,
                "face": face, "employee": employee,
            })
        self.roles.forget_stale()

        return {"w": w, "h": h, "people": people, "ms": round((time.perf_counter() - started) * 1000)}
