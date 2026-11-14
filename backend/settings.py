"""Tunable numbers, in one place."""

MODEL_NAME = "yolov8n-pose.pt"  # small, fast person detector with 17 COCO body keypoints

# Finding the torso from the shoulder and hip keypoints.
KEYPOINT_CONFIDENCE = 0.5   # a keypoint below this is treated as not visible
TORSO_SHRINK = 0.15         # each corner moves this share of the way to the centre: keeps arms and background out
TORSO_LENGTH = 1.5          # shoulders-to-hips distance in shoulder widths, when the hips are not visible
TORSO_MIN_WIDTH = 0.15      # shoulders closer than this share of the box width: side-on, keypoints not used

# Judging black against the scene's lighting. Lightness is CIE L* scaled to 0-255.
SCENE_SAMPLE_SIZE = (80, 60)    # the frame is shrunk to this before its lightness is measured
SCENE_BLACK_SHARE = 0.02        # the scene's black point: this share of it is darker
SCENE_WHITE_SHARE = 0.95        # ... and its white point
SCENE_SMOOTHING = 0.2           # weight of each new frame in the running lightness spread
SCENE_BLACK_CEILING = 0.35      # the black point is never above this share of the white point
SCENE_MIN_RANGE = 64            # the white point is at least this far above the black point
SCENE_CUTOFF_CURVE = 0.63       # bends the 0-255 black setting: 60 lands 40% of the way up the range, where lit black cloth reads

# Defaults for the apron check; the page can change both while running.
APRON_MAX_BRIGHTNESS = 60   # black is this dark or darker, on 0 (scene black point) to 255 (white point)
APRON_SHARE = 0.35          # share of the torso that must be black to be an employee
APRON_MAX_CHROMA = 25       # Lab colourfulness above this is a dark colour (navy, burgundy), not black

# Faces: InsightFace buffalo_l (SCRFD detector + ArcFace ResNet-50 embeddings).
FACE_MODEL = "buffalo_l"
FACE_MODEL_ROOT = "~/.insightface"  # downloaded here on first run: outside the repository
FACE_DETECT_SIZE = 640          # the image is fitted into a square this size for face detection
FACE_MIN_CONFIDENCE = 0.5       # detector score below this is not a face
FACE_DETECT_EVERY = 3           # in the stream, look for faces on every Nth frame
FACE_RECHECK_AFTER = 1.0        # seconds between identity checks of a track that is not yet identified
FACE_MATCH_THRESHOLD = 0.40     # cosine similarity needed to be the same person
FACE_PICK_REACH = 1.0           # registering: the face may be this many box sizes from the box it was picked with

SMOOTH_FRAMES = 15          # frames the black share is averaged over, per person
FORGET_AFTER = 60.0         # seconds before an unseen track is dropped
