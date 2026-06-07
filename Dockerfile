# Stage 1: Build Next.js static site
FROM node:18-alpine AS frontend-builder
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

# Create writable logs & reports folders with open permissions
RUN mkdir -p /app/logs /app/reports && chmod -R 777 /app

# Set up user for Hugging Face Spaces (UID 1000)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
ENV PATH="/opt/venv/bin:$PATH"

# Expose port 7860
EXPOSE 7860

# Run FastAPI backend
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
