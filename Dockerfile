# Stage 1: Build Next.js static site
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Create Python runtime environment
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up virtual environment and install backend dependencies
COPY backend/requirements.txt ./backend/
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy source code and frontend build outputs
COPY backend/ ./backend/
COPY config/ ./config/
COPY --from=frontend-builder /app/frontend/out ./frontend/out

# Set up workspace environment
ENV WORKSPACE_DIR=/app
ENV PORT=7860

# Set up user for Hugging Face Spaces (UID 1000)
RUN useradd -m -u 1000 user

# Create writable logs & reports folders owned by the runtime user.
# Only the directories the app writes to are made writable; the rest of /app
# stays read-only to the runtime user.
RUN mkdir -p /app/logs /app/reports \
    && chown -R user:user /app/logs /app/reports /app/backend \
    && chmod -R 755 /app

USER user
ENV HOME=/home/user
ENV PATH="/opt/venv/bin:$PATH"

# Expose port 7860
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7860/api/health', timeout=4).status == 200 else 1)"

# Run FastAPI backend
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
