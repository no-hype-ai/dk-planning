# Plan 04: Agent Mesh Integration

## Goal

Deploy the Python FastAPI agent-mesh component to K8s alongside the Node.js services. Agent-mesh doesn't fit the standard dk-template Node.js scaffold and requires special handling for containerization, ingress, database, and resource management.

## Current State

| Attribute | Value |
|-----------|-------|
| **Framework** | FastAPI (Python) |
| **Ports** | 8765 (Agent MCP Server), 8766 (OpenClaw MCP Server) |
| **Database** | SQLModel with 20 tables (separate from Prisma) |
| **Auth** | Clerk (JWT validation) |
| **Capabilities** | 40+ MCP tools, inter-agent messaging, Docker orchestrator, work reports |
| **Location** | `apps/agent-mesh/` in DK-OS monorepo |
| **Dependencies** | PostgreSQL, LiteLLM, Clerk, Docker socket (for orchestration) |

## Dependencies

| Dependency | Plan | Status |
|-----------|------|--------|
| K8s migration for Node.js services | [dk-os/01](01-k8s-migration.md) | Not started |
| PostgreSQL available in K8s | [dk-os/03](03-infrastructure-services.md) | Decision pending |

---

## Workstream 1: Containerization

### Dockerfile (Python-specific)

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app

# Install dependencies
COPY apps/agent-mesh/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY apps/agent-mesh/ .

# Non-root user
RUN adduser --disabled-password --gecos "" agent && chown -R agent:agent /app
USER agent

EXPOSE 8765 8766
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8765"]
```

**Key differences from Node.js services:**
- No Turbo/pnpm build pipeline
- Separate `requirements.txt` or `pyproject.toml`
- Different base image (`python:3.12-slim` not `node:20-alpine`)
- Different health check endpoint patterns
- May need GPU access for local inference (evaluate)

### CI Build

Add agent-mesh to the build matrix in CI workflow:
```yaml
strategy:
  matrix:
    service: [app, portal, web, api, agent-mesh]
    include:
      - service: agent-mesh
        dockerfile: apps/agent-mesh/Dockerfile
        context: .
```

---

## Workstream 2: K8s Deployment

### Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-mesh
  labels:
    app.kubernetes.io/name: agent-mesh
    app.kubernetes.io/part-of: dk-os
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: agent-mesh
          image: ghcr.io/data-kinetic/dk-os/agent-mesh:latest
          ports:
            - containerPort: 8765
              name: agent-mcp
            - containerPort: 8766
              name: openclaw-mcp
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: dk-os-secrets
                  key: AGENT_MESH_DATABASE_URL
          resources:
            requests:
              cpu: 250m
              memory: 512Mi
            limits:
              cpu: "1"
              memory: 1Gi
```

### Service

Expose both ports:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: agent-mesh
spec:
  ports:
    - name: agent-mcp
      port: 8765
      targetPort: 8765
    - name: openclaw-mcp
      port: 8766
      targetPort: 8766
```

### IngressRoute

```yaml
# Agent MCP endpoint
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: agent-mesh-mcp
spec:
  routes:
    - match: Host(`agents.dk-os.datakinetic.com`)
      services:
        - name: agent-mesh
          port: 8765
```

---

## Workstream 3: Database Isolation

Agent-mesh uses SQLModel (SQLAlchemy-based) with 20 tables, **separate from the main Prisma schema**.

### Options

| Option | Pros | Cons |
|--------|------|------|
| **A: Shared PostgreSQL, separate schema** | One DB to manage | Schema collision risk, migration coordination |
| **B: Separate PostgreSQL database** | Full isolation | Extra connection overhead |
| **C: Shared PostgreSQL, separate database** | Isolation within same instance | Middle ground |

### Recommendation: C (Separate database, same PostgreSQL instance)

Create database `dk_os_agents` in the same PostgreSQL instance as `dk_os`. Agent-mesh connects with its own credentials and `AGENT_MESH_DATABASE_URL`.

Migration management: SQLModel/Alembic (Python) runs independently from Prisma migrations.

---

## Workstream 4: Docker Orchestrator Security

Agent-mesh includes a **Docker orchestrator** that manages containers for agent execution. In K8s, this has security implications:

### Options

| Approach | Security | Complexity |
|----------|----------|-----------|
| **A: Docker-in-Docker (DinD)** | Container isolation | Privileged pod required |
| **B: Docker socket mount** | Direct host access | Security risk — avoid in shared cluster |
| **C: K8s Job API** | Native, no Docker socket | Code changes needed |
| **D: Disable orchestrator** | Safe | Reduced functionality |

### Recommendation: D initially, C long-term

1. **Phase 1:** Deploy agent-mesh without Docker orchestrator (MCP tools + agent messaging still work)
2. **Phase 2:** Migrate orchestrator from Docker to K8s Job API — agent executions create K8s Jobs with appropriate resource limits and RBAC

---

## Workstream 5: dk-template Gap — Python Service Support

DK-OS agent-mesh reveals a gap in dk-template: no support for Python services.

**Document the pattern for mixed-language monorepos:**
- Separate Dockerfile per language (not shared multi-stage)
- Separate CI matrix entries with language-specific build steps
- Separate health check patterns (FastAPI `/health` vs Node.js `/health`)
- Separate dependency management (requirements.txt vs package.json)
- Same Kustomize overlay pattern (base + prod/staging)
- Same DopplerSecret injection pattern
- Same ArgoCD Application pattern

This pattern should be captured in [dk-template/07](../dk-template/07-enforcement-gaps.md) Gap Category 6.

---

## Verification

- [ ] Agent-mesh Docker image builds and pushes to GHCR
- [ ] K8s deployment running in `dk-os-prod` namespace
- [ ] MCP server accessible at `agents.dk-os.datakinetic.com:8765`
- [ ] Agent-mesh connects to its own database (`dk_os_agents`)
- [ ] Clerk auth working (JWT validation)
- [ ] DK-OS app can communicate with agent-mesh API
- [ ] Health endpoint responding
- [ ] No Docker socket mounted (orchestrator disabled or migrated to K8s Jobs)

---

## Workstream 6: Platform-Wide Agent API

DK-OS agent-mesh now serves as the **centralized agent execution layer** for all products (carbon-5, behavior-labs-ai). This supersedes the previously planned standalone agent repo — all agent orchestration, MCP tooling, and AI execution capabilities are consolidated within DK-OS agent-mesh.

### Scope

- Expose a platform-wide Agent API that product repos consume for AI-driven workflows
- Provide MCP tool registration and discovery for cross-product use cases
- Manage agent lifecycle (creation, execution, monitoring, teardown) centrally
- Maintain per-product isolation via tenant-scoped API keys and database partitioning

### PR Review Service Integration

The PR critic / code review service will run within agent-mesh, deployed on **krang GPUs** for inference workloads:

- Agent-mesh hosts the review agent as a registered MCP tool
- GitHub webhook events route through the platform API to agent-mesh
- Inference runs on krang GPU nodes via resource requests (`nvidia.com/gpu: 1`)
- Results posted back to GitHub PRs via the GitHub integration layer

### Dependencies

| Dependency | Status |
|-----------|--------|
| Workstreams 1-5 (this plan) | Prerequisite — agent-mesh must be on K8s first |
| krang GPU node availability | Verify GPU operator + device plugin installed |
| Platform API (dk-alchemy/01) | Routes external requests to agent-mesh |
