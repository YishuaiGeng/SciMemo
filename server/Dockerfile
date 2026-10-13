FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SCIMEMO_DB_PATH=/data/sync.sqlite3
WORKDIR /app
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r server/requirements.txt && useradd --uid 10001 --create-home appuser && mkdir /data && chown appuser /data
COPY server/app /app/server/app
COPY schemas /app/schemas
USER appuser
EXPOSE 8787
CMD ["uvicorn", "server.app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8787"]
