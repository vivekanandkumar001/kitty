FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=7861
EXPOSE 7861

CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-7861} --workers 2 --timeout 120 app:app"]