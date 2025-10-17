FROM python:3.12-slim

# Install system deps
RUN apt-get update && apt-get install -y curl build-essential && rm -rf /var/lib/apt/lists/*

# Install PDM
RUN pip install --no-cache-dir pdm

WORKDIR /app

# Copy project files and install dependencies
COPY pyproject.toml pdm.lock* ./
# Install all packages inside the **in-project virtualenv** (doesn't require activating)
RUN pdm config python.use_venv false && pdm install --without dev --no-editable

COPY . .

# Expose backend port
EXPOSE 8000

# Run migrate + dev in a single command (PDM will find alembic now)
CMD ["pdm", "run", "start"]
