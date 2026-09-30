FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STUDIO_DATA=/data \
    STUDIO_HOST=0.0.0.0

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && groupadd --system studio \
    && useradd --system --gid studio --home-dir /app studio \
    && mkdir /data \
    && chown studio:studio /data

COPY --chown=studio:studio app.py .
COPY --chown=studio:studio studio ./studio
COPY --chown=studio:studio web ./web

USER studio
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:7860/api/bootstrap', timeout=2)" || exit 1

CMD ["python", "app.py"]
