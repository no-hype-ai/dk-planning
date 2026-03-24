# Local Development & Preview Environment Support

**Status:** Complete

## Context
Product repos need local development environments and VM-based preview deployments. dk-template generates docker-compose configs for both, plus Doppler setup scripts. Local dev uses `.gitops/local/apps/`, previews use `docker-compose.preview.yaml` at the root.

## Scope
- Local docker-compose environment with Doppler secrets
- Preview docker-compose for VM101 deployment via dk-cli
- Doppler setup script for local dev
- Environment variable templates

## Dependencies
- Plan 01 (Core Scaffold) — base directory structure
- Doppler CLI installed on developer machines
- Platform API for preview orchestration (dk-alchemy plan 01)

## Implementation Steps

### Step 1: Create `.gitops/local/apps/docker-compose.yaml`
```yaml
version: '3.8'

services:
  {{service}}:
    build:
      context: ../../../
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - OTEL_SERVICE_NAME={{product}}-{{service}}
      - OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
    env_file:
      - .env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: {{product}}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

### Step 2: Create `.gitops/local/apps/.env.example`
```
# Local development environment variables
# Copy to .env and fill in values, or use Doppler:
#   doppler run -- docker-compose up

# App
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/{{product}}

# Redis
REDIS_URL=redis://redis:6379

# OpenTelemetry (optional for local dev)
OTEL_SERVICE_NAME={{product}}-{{service}}
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# LiteLLM (if using AI features)
# LITELLM_API_KEY=sk-...
# LITELLM_BASE_URL=http://litellm.infra.svc.cluster.local:8000/v1
```

### Step 3: Create `docker-compose.preview.yaml`
```yaml
version: '3.8'

# Preview environment — deployed to VM101 via dk-cli / Platform API
# Domain: {{branch}}.preview.behaviorlabs.ai

services:
  {{service}}:
    image: ghcr.io/data-kinetic/{{repo-name}}/{{service}}:${IMAGE_TAG:-latest}
    ports:
      - "${PORT:-3000}:3000"
    env_file:
      - .env.preview
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: {{product}}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-preview}
    volumes:
      - preview_postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

volumes:
  preview_postgres:
```

### Step 4: Create `scripts/doppler/setup-doppler-dev.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

PRODUCT="{{product}}"
PROJECT="${PRODUCT}-applications"

echo "Setting up Doppler for local development..."
echo "Project: ${PROJECT}"
echo "Config: dev"
echo ""

# Check Doppler CLI
if ! command -v doppler &> /dev/null; then
  echo "Error: Doppler CLI not installed. See https://docs.doppler.com/docs/install-cli"
  exit 1
fi

# Login check
if ! doppler me &> /dev/null; then
  echo "Please login to Doppler first: doppler login"
  exit 1
fi

# Set up project
doppler setup --project "$PROJECT" --config dev --no-interactive

echo ""
echo "Done! You can now run:"
echo "  doppler run -- docker-compose -f .gitops/local/apps/docker-compose.yaml up"
echo ""
echo "Or generate a .env file:"
echo "  doppler secrets download --no-file --format env > .gitops/local/apps/.env"
```

## dk-template Files Created
- `.gitops/local/apps/docker-compose.yaml`
- `.gitops/local/apps/.env.example`
- `docker-compose.preview.yaml`
- `scripts/doppler/setup-doppler-dev.sh`

## Verification
- `docker-compose -f .gitops/local/apps/docker-compose.yaml config` validates
- `docker-compose -f docker-compose.preview.yaml config` validates
- setup-doppler-dev.sh is executable and has correct project name after init.sh
- .env.example has correct product/service placeholders replaced
