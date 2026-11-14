"""How light and dark the scene is right now, so "black" is judged against the lighting.

A webcam's auto-exposure re-brightens the picture when something dark fills it, so
black cloth has no fixed pixel value. What holds far better is where it sits
between the scene's black point and white point.
"""
import cv2
import numpy as np

from .settings import (
    SCENE_BLACK_CEILING,
    SCENE_BLACK_SHARE,
    SCENE_CUTOFF_CURVE,
    SCENE_MIN_RANGE,
    SCENE_SAMPLE_SIZE,
    SCENE_SMOOTHING,
    SCENE_WHITE_SHARE,
)


class SceneLight:
    """The frame's spread of lightness, smoothed over recent frames."""

    def __init__(self):
        self.histogram = None  # share of the frame at each lightness 0-255; None before the first frame

    def update(self, frame):
        small = cv2.resize(frame, SCENE_SAMPLE_SIZE, interpolation=cv2.INTER_AREA)
        lightness = cv2.cvtColor(small, cv2.COLOR_BGR2LAB)[..., 0]
        histogram = np.bincount(lightness.ravel(), minlength=256) / lightness.size
        if self.histogram is not None:
            histogram = self.histogram + (histogram - self.histogram) * SCENE_SMOOTHING
        self.histogram = histogram

    def level(self, share):
        """Lightness that this share (0 to 1) of the scene is darker than."""
        return min(255, int(np.searchsorted(np.cumsum(self.histogram), share)))

    def cutoff(self, max_brightness):
        """Lightness at or below which a pixel is black; max_brightness runs 0 (black point) to 255 (white point)."""
        black, white = self.level(SCENE_BLACK_SHARE), self.level(SCENE_WHITE_SHARE)
        # Nothing dark in view: do not let the darkest mid-tone stand in for black.
        black = min(black, SCENE_BLACK_CEILING * white)
        # Nothing bright in view (dim room, or one dark person filling the frame): keep a usable range.
        white = max(white, black + SCENE_MIN_RANGE)
        return black + (white - black) * (max_brightness / 255) ** SCENE_CUTOFF_CURVE

    def reset(self):
        self.histogram = None
