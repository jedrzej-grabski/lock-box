FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir pdm

COPY pyproject.toml pdm.lock* ./

# Install dependencies (without --no-self to install in editable mode)
RUN pdm install

COPY . .

EXPOSE 8000

CMD ["pdm", "run", "start"]