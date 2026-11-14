"""Where a person's torso is, from their pose keypoints."""
import numpy as np

from .settings import KEYPOINT_CONFIDENCE, TORSO_LENGTH, TORSO_MIN_WIDTH, TORSO_SHRINK

# COCO keypoint indices.
LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP = 5, 6, 11, 12


def torso_polygon(track, frame_w, frame_h):
    """Torso outline as [x, y] pixel points: left shoulder, right shoulder, right hip, left hip.

    Hips that are not visible are estimated below the shoulders. None if the shoulders
    are not visible, or so close together (person side-on) that they span no torso.
    """
    points = np.array(track.keypoints)
    shoulders, hips = points[[LEFT_SHOULDER, RIGHT_SHOULDER]], points[[RIGHT_HIP, LEFT_HIP]]
    x1, y1, x2, y2 = track.box
    width = np.linalg.norm(shoulders[0, :2] - shoulders[1, :2])
    if shoulders[:, 2].min() < KEYPOINT_CONFIDENCE or width < TORSO_MIN_WIDTH * (x2 - x1):
        return None
    if hips[:, 2].min() >= KEYPOINT_CONFIDENCE:
        hips = hips[:, :2]
    else:
        # Cut off at the waist: drop straight down from the shoulders.
        hips = shoulders[::-1, :2] + (0, TORSO_LENGTH * width)
    # Stay on the visible person: hidden or estimated hips can land on a counter or past the frame edge.
    quad = np.clip(np.vstack([shoulders[:, :2], hips]), (x1, y1), (min(x2, frame_w - 1), min(y2, frame_h - 1)))
    quad += (quad.mean(axis=0) - quad) * TORSO_SHRINK
    return np.rint(quad).astype(int).tolist()
