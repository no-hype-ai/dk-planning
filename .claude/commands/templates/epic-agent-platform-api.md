# Platform API Agent Context

> Include when the agent is working on Platform API code in dk-alchemy.

## Architecture

- **Framework:** FastAPI (Python 3.12)
- **Location:** `src/platform-api/` in dk-alchemy
- **Deployment:** `k8s/infrastructure/platform-api/`
- **Domain:** `dk.datakinetic.com`
- **In-cluster:** `platform-api.infra.svc.cluster.local`

## Directory Structure

```
src/platform-api/
  src/platform_api/
    __init__.py
    main.py                   # FastAPI app, router registration
    config.py                 # Settings from env/Doppler
    auth.py                   # Token validation, RBAC
    routers/
      health.py               # /health, /ready
      labels.py               # /dk/v1/labels/*
      llm.py                  # /dk/v1/llm/*
      previews.py             # /dk/v1/previews/*
      webhooks.py             # /dk/v1/webhooks/*
      data.py                 # /dk/v1/data/* (create if needed)
    models/
      ...                     # Pydantic models per router
  migrations/
    001_initial.sql
    002_*.sql
    ...
  tests/
    ...
  pyproject.toml
  Dockerfile
```

## Conventions

### Router Pattern
```python
from fastapi import APIRouter, Depends, HTTPException
from ..auth import require_role, Role
from ..models.{domain} import {Models}

router = APIRouter(prefix="/dk/v1/{domain}", tags=["{domain}"])

@router.get("/")
async def list_items(user=Depends(require_role(Role.DEVELOPER))):
    ...
```

### Auth / RBAC
```python
# Roles: ADMIN > DEVELOPER > READONLY
# Token format: dk_{random} — stored in Doppler, validated against config
require_role(Role.ADMIN)      # Full access
require_role(Role.DEVELOPER)  # LLM keys, previews, data keys
require_role(Role.READONLY)   # Read-only endpoints
```

### Pydantic Models
```python
from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID

class ItemCreate(BaseModel):
    """Request model for creating an item."""
    name: str = Field(..., min_length=1, max_length=64)

class ItemResponse(BaseModel):
    """Response model for an item."""
    id: UUID
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
```

### Database Migrations
- Sequential numbered SQL files in `migrations/`
- Run as ArgoCD PreSync hook (Job)
- Use `IF NOT EXISTS` for idempotency
- PostgreSQL via CloudNativePG cluster

### Router Registration
After creating a new router, register it in `main.py`:
```python
from .routers import data
app.include_router(data.router)
```

## Validation Steps

```bash
cd /Users/nick/Code/dk-alchemy/src/platform-api

# Type checking (if configured)
python3 -m mypy src/platform_api/ --ignore-missing-imports 2>&1 | tail -5

# Lint
python3 -m ruff check src/platform_api/ 2>&1 | tail -10

# Tests (if exist)
python3 -m pytest tests/ -v 2>&1 | tail -20

# Import check — verify router can be imported
python3 -c "from platform_api.routers.data import router; print('Router OK')"
```

## Secrets (Doppler)

| Secret | Project | Purpose |
|--------|---------|---------|
| `PLATFORM_API_TOKEN_*` | `dk-infrastructure/prd` | API auth tokens |
| `LITELLM_MASTER_KEY` | `00-dk-tools/prd` | LiteLLM proxy auth |
| `GITHUB_WEBHOOK_SECRET_*` | `dk-infrastructure/prd` | Per-repo webhook HMAC |
| `DATABASE_URL` | `dk-infrastructure/prd` | PostgreSQL connection |
