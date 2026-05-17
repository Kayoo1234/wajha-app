# Wajha backend — FastAPI + Cohere + CLIP + Groq + Gemini
# Built for Fly.io (single-machine, persistent process, ~2 GB RAM)
#
# Image layers, in order:
#   1. Python 3.12 slim base (~150 MB)
#   2. System deps (libgomp1 for torch; libheif/libde265 for AVIF)
#   3. Python deps from requirements.txt (~1.5 GB — torch dominates)
#   4. Pre-download CLIP weights at build time (~600 MB) so first request
#      doesn't pay the model-download cost on a cold start
#   5. App source code (smallest layer; changes most often)
#
# Resulting image: ~2.6 GB. Fits Fly.io's 8 GB image-storage cap comfortably.

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Force HuggingFace caches into one directory we can pre-warm at build time
    HF_HOME=/opt/hf-cache \
    SENTENCE_TRANSFORMERS_HOME=/opt/hf-cache/sentence-transformers \
    TRANSFORMERS_OFFLINE=0

WORKDIR /app

# System libs needed by Pillow/AVIF and by torch's threading
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
        libheif1 \
        libde265-0 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python deps — cached separately from app code so source changes don't bust this layer
COPY requirements.txt .
RUN pip install -r requirements.txt

# Pre-download CLIP ViT-B/32 weights so first /search/visual call is warm
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('clip-ViT-B-32')" \
    && du -sh /opt/hf-cache

# App source last — fast rebuilds on code-only changes
COPY . .

# Fly.io will route HTTPS on 443 → this internal port 8000
EXPOSE 8000

# Run uvicorn directly — no reload, single worker (CLIP+Cohere clients are
# stateful and benefit from a single in-process cache)
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
