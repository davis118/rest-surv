# Backend image for Cloud Run (CPU only). Build from the project root.
FROM python:3.10-slim

# HOME=/app so the face models land in /app/.insightface, where the app looks for them.
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/app \
    YOLO_CONFIG_DIR=/tmp/ultralytics

# build-essential: insightface compiles a small extension. libgl1/libglib: needed by OpenCV.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# CPU-only PyTorch first, so the requirements below do not pull the much larger GPU build.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple \
    && pip install -r backend/requirements.txt

# Bake the model weights into the image so a cold start does not download them.
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n-pose.pt')" \
    && python -c "from insightface.app import FaceAnalysis; FaceAnalysis(name='buffalo_l', root='/app/.insightface', allowed_modules=['detection', 'recognition'], providers=['CPUExecutionProvider'])" \
    && rm -f /app/.insightface/models/buffalo_l.zip \
             /app/.insightface/models/buffalo_l/1k3d68.onnx \
             /app/.insightface/models/buffalo_l/2d106det.onnx \
             /app/.insightface/models/buffalo_l/genderage.onnx

COPY backend backend

# Cloud Run sets PORT.
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
