# The recomposed French cards, made on a schedule (auto.py).
#
#   docker run --rm -v /mnt/user/appdata/spellforge:/data \
#     -v /mnt/user/appdata/spellforge/fonts:/fonts:ro ghcr.io/diix46/spellforge-recompose
#
# The print fonts are proprietary: never in this image (the repository is
# public), always mounted at run time.
FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
COPY assets ./assets

ENV PRISM_FONTS_DIR=/fonts PYTHONUNBUFFERED=1
ENTRYPOINT ["python", "auto.py", "--data", "/data"]
