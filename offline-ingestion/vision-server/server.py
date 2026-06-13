"""
Local vision sidecar for the photo gallery's people and dog search.

Endpoints:
    POST /detect       - face detection + 512-d ArcFace embedding (InsightFace)
    POST /detect-dogs  - dog detection (YOLOv8) + 384-d DINOv2-small embedding

Run on the same machine as ingestion (CPU is fine for both pipelines) or on a
beefier box if you want — biometric-class data (faces/pets) stays local.

Usage:
    pip install -r requirements.txt
    python server.py

On startup it prints the URL to use for VISION_SERVER_HOST in ingestion/.env.
The dog models are loaded lazily on first /detect-dogs call so face-only users
don't pay the cost.
"""
import asyncio
import base64
import io
import os
import socket
from typing import List, Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from insightface.app import FaceAnalysis

from PIL import Image
from pydantic import BaseModel

PORT = int(os.environ.get("PORT", 8090))
API_KEY = os.environ.get("VISION_SERVER_API_KEY")  # optional bearer token
DET_SIZE = int(os.environ.get("DET_SIZE", 640))  # bigger = catches smaller faces, slower
DOG_DET_CONF = float(os.environ.get("DOG_DET_CONF", 0.5))

app = FastAPI()
sem = asyncio.Semaphore(int(os.environ.get("CONCURRENCY", 4)))

# buffalo_l = SCRFD detection + arcface r50 512-d recognition. Auto-downloads
# on first run to ~/.insightface/models/.
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(DET_SIZE, DET_SIZE))

# Dog models are heavy (~1GB combined) — load on first request, not at startup.
_dog_lock = asyncio.Lock()
_dog_state: dict = {}


async def _load_dog_models() -> dict:
    if "yolo" in _dog_state:
        return _dog_state
    async with _dog_lock:
        if "yolo" in _dog_state:
            return _dog_state
        print("[dogs] loading YOLOv8n + DINOv2-small (first call, may take a moment)...")
        # Lazy imports so face-only users don't even need torch installed.
        import torch
        from transformers import AutoImageProcessor, AutoModel
        from ultralytics import YOLO

        yolo = YOLO("yolov8n.pt")  # ~6MB, downloads on first use
        processor = AutoImageProcessor.from_pretrained("facebook/dinov2-small")
        model = AutoModel.from_pretrained("facebook/dinov2-small")
        model.eval()
        _dog_state.update(
            yolo=yolo, processor=processor, model=model, torch=torch
        )
        print("[dogs] models loaded.")
        return _dog_state


class DetectRequest(BaseModel):
    image: str  # base64-encoded JPEG/PNG


class FaceOut(BaseModel):
    bbox: List[float]  # [x1, y1, x2, y2] in pixels of the input image
    det_score: float
    embedding: List[float]  # 512-d, L2-normalized


class DetectResponse(BaseModel):
    width: int
    height: int
    faces: List[FaceOut]


class DogOut(BaseModel):
    bbox: List[float]
    det_score: float
    embedding: List[float]  # 384-d, L2-normalized


class DetectDogsResponse(BaseModel):
    width: int
    height: int
    dogs: List[DogOut]


def _check_auth(req: Request) -> None:
    if not API_KEY:
        return
    auth = req.headers.get("authorization", "")
    if auth != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _decode_image(b64: str) -> Image.Image:
    try:
        img_bytes = base64.b64decode(b64)
        return Image.open(io.BytesIO(img_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"bad image: {e}") from e


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/detect", response_model=DetectResponse)
async def detect(payload: DetectRequest, request: Request) -> DetectResponse:
    _check_auth(request)
    img = _decode_image(payload.image)
    width, height = img.size
    arr = np.array(img)[:, :, ::-1]  # PIL is RGB; insightface expects BGR

    async with sem:
        # face_app.get is sync/CPU-bound; offload to a thread so we don't
        # block the event loop while other requests queue.
        faces = await asyncio.to_thread(face_app.get, arr)

    out: List[FaceOut] = []
    for f in faces:
        x1, y1, x2, y2 = (float(v) for v in f.bbox)
        emb = f.normed_embedding.astype(np.float32)
        out.append(
            FaceOut(
                bbox=[x1, y1, x2, y2],
                det_score=float(f.det_score),
                embedding=emb.tolist(),
            )
        )
    return DetectResponse(width=width, height=height, faces=out)


COCO_DOG_CLASS = 16


def _detect_dogs_sync(state: dict, img: Image.Image) -> List[DogOut]:
    yolo = state["yolo"]
    processor = state["processor"]
    model = state["model"]
    torch = state["torch"]

    results = yolo.predict(
        img, classes=[COCO_DOG_CLASS], conf=DOG_DET_CONF, verbose=False
    )
    out: List[DogOut] = []
    if not results:
        return out
    boxes = results[0].boxes
    if boxes is None or len(boxes) == 0:
        return out

    xyxy = boxes.xyxy.cpu().numpy()
    confs = boxes.conf.cpu().numpy()

    crops = []
    bboxes: List[List[float]] = []
    scores: List[float] = []
    for (x1, y1, x2, y2), score in zip(xyxy, confs):
        x1f, y1f, x2f, y2f = float(x1), float(y1), float(x2), float(y2)
        crop = img.crop((x1f, y1f, x2f, y2f))
        # Skip degenerate boxes that processors choke on.
        if crop.width < 4 or crop.height < 4:
            continue
        crops.append(crop)
        bboxes.append([x1f, y1f, x2f, y2f])
        scores.append(float(score))

    if not crops:
        return out

    inputs = processor(images=crops, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    # CLS token = first position of last_hidden_state. Shape: (N, 384).
    emb = outputs.last_hidden_state[:, 0, :].numpy().astype(np.float32)
    # L2 normalize so downstream cosine = dot product.
    norms = np.linalg.norm(emb, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    emb /= norms

    for bbox, score, vec in zip(bboxes, scores, emb):
        out.append(DogOut(bbox=bbox, det_score=score, embedding=vec.tolist()))
    return out


@app.post("/detect-dogs", response_model=DetectDogsResponse)
async def detect_dogs(payload: DetectRequest, request: Request) -> DetectDogsResponse:
    _check_auth(request)
    state = await _load_dog_models()
    img = _decode_image(payload.image)
    width, height = img.size

    async with sem:
        dogs = await asyncio.to_thread(_detect_dogs_sync, state, img)

    return DetectDogsResponse(width=width, height=height, dogs=dogs)


def _lan_ip() -> Optional[str]:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return None
    finally:
        s.close()


if __name__ == "__main__":
    ip = _lan_ip() or "127.0.0.1"
    print(f"Vision server: http://{ip}:{PORT}  (auth={'on' if API_KEY else 'off'})")
    print(f"  /detect       - face detection (loaded)")
    print(f"  /detect-dogs  - dog detection (lazy-loaded on first call)")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
