# syntax=docker/dockerfile:1
# Local vision sidecar: face detection + ArcFace embeddings (InsightFace) and,
# lazily, dog detection (YOLOv8) + DINOv2 embeddings. CPU-only.
#
# Model weights are NOT baked in — InsightFace (buffalo_l) and the DINOv2 weights
# auto-download on first use. docker-compose mounts persistent volumes for those
# caches so the download happens once.
FROM python:3.11-slim

# OpenCV (pulled in by insightface/ultralytics) needs libGL + glib at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

# uv: a much faster, more resilient installer than pip — parallel, HTTP/2,
# resumable downloads with real retry/backoff, so it powers through a flaky PyPI
# edge that wedges pip on a single stuck download. The cache mounts below persist
# downloaded wheels across builds, so a re-run never re-fetches.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app
COPY requirements.txt ./

# torch + torchvision must be the version-matched CPU builds, or torchvision::nms
# fails to link and the dog pipeline (DINOv2's AutoImageProcessor) breaks.
# Installing requirements pulls a plain PyPI torchvision over the +cpu one, so we
# re-pin it from the CPU index as the LAST step (--no-deps so torch is untouched).
# Each step is its own RUN, so it's a separate, individually-cached build line.

RUN --mount=type=cache,target=/root/.cache/uv \
    echo "=== [1/3] torch + torchvision (CPU wheels) ===" \
 && uv pip install --system torch torchvision \
      --index-url https://download.pytorch.org/whl/cpu

RUN --mount=type=cache,target=/root/.cache/uv \
    echo "=== [2/3] requirements (fastapi, insightface, onnxruntime, ultralytics, transformers) ===" \
 && uv pip install --system -r requirements.txt

RUN --mount=type=cache,target=/root/.cache/uv \
    echo "=== [3/3] re-pin torch + torchvision to the matched CPU build ===" \
 && uv pip install --system --reinstall --no-deps torch torchvision \
      --index-url https://download.pytorch.org/whl/cpu \
 && echo "=== installed versions ===" \
 && uv pip list | grep -iE "^(torch|torchvision) "

COPY server.py yolov8n.pt ./

ENV PORT=8090
EXPOSE 8090
CMD ["python", "server.py"]
