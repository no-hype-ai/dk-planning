# Core Scaffold: GitOps + K8s Manifests + Init Script

## Context

dk-template needs to generate the complete GitOps and Kubernetes directory structure for any new Data Kinetic product repo. This is the foundation -- every other plan builds on this scaffold. The init.sh script handles placeholder replacement, multi-service support, and self-cleanup.

See [dk-planning architecture overview](../../docs/architecture-overview.md) and [dk-alchemy platform components](../dk-alchemy/01-kustomize-components.md) for foundational context.

## Scope

- `init.sh` script with placeholder replacement engine
- ArgoCD Application manifests (`.gitops/`)
- Kubernetes deployment manifests (`k8s/`)
- DopplerSecret CRD manifests
- Template `README.md`

## Dependencies

- dk-template repo exists on GitHub (done -- `data-kinetic/dk-template`)
- dk-alchemy Kustomize components referenced in overlays (see [dk-alchemy plans](../dk-alchemy/))

## Implementation Steps

### Step 1: Create `scripts/init.sh`

The init script is the core of dk-template. It:
1. Parses args: `--product <name> --team <team> --service <name>` (service repeatable)
2. Validates inputs (no spaces, lowercase, valid DNS names)
3. Replaces ALL occurrences of these placeholders in all files:
   - `{{product}}` -> product name (e.g., `carbon-5`)
   - `{{team}}` -> team name (e.g., `data-platform`)
   - `{{service}}` -> primary service name (e.g., `api`)
   - `{{repo-name}}` -> GitHub repo name (defaults to product name)
   - `{{namespace-prod}}` -> `{{product}}-prod`
   - `{{namespace-staging}}` -> `{{product}}-staging`
4. For each `--service`:
   - Copies `k8s/apps/{{service}}/` template directory to `k8s/apps/<actual-name>/`
   - Copies `.gitops/prod/apps/{{service}}.yaml` to `.gitops/prod/apps/<actual-name>.yaml`
   - Copies `.gitops/staging/apps/{{service}}.yaml`
   - Copies `monitoring/dashboards/{{service}}-overview.json`
   - Copies `monitoring/alerts/{{service}}.yaml`
5. Removes template placeholder directories (`k8s/apps/{{service}}/`, etc.)
6. Removes `_dk-alchemy-pr/` instructions file (keeps generated content)
7. Removes `scripts/init.sh` itself
8. Prints next steps checklist

Script should be written in bash, compatible with macOS (BSD sed) and Linux (GNU sed).

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<USAGE
Usage: $0 --product <name> --team <team> --service <name> [--service <name> ...]

Options:
  --product    Product name (e.g., carbon-5). Must be lowercase, DNS-safe.
  --team       Team name (e.g., data-platform). Must be lowercase, DNS-safe.
  --service    Service name (repeatable). Must be lowercase, DNS-safe.
  --repo-name  GitHub repo name (defaults to product name).
  --help       Show this help message.

Example:
  $0 --product carbon-5 --team data-platform --service api --service worker
USAGE
  exit 1
}

validate_dns_name() {
  local name="$1"
  local label="$2"
  if [[ ! "$name" =~ ^[a-z][a-z0-9-]*[a-z0-9]$ ]] && [[ ! "$name" =~ ^[a-z]$ ]]; then
    echo "Error: $label '$name' is not a valid DNS name (lowercase, alphanumeric, hyphens only, must start with letter)."
    exit 1
  fi
}

# --- Parse arguments ---
PRODUCT=""
TEAM=""
REPO_NAME=""
SERVICES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --product) PRODUCT="$2"; shift 2 ;;
    --team) TEAM="$2"; shift 2 ;;
    --service) SERVICES+=("$2"); shift 2 ;;
    --repo-name) REPO_NAME="$2"; shift 2 ;;
    --help) usage ;;
    *) echo "Unknown argument: $1"; usage ;;
  esac
done

[[ -z "$PRODUCT" ]] && echo "Error: --product is required" && usage
[[ -z "$TEAM" ]] && echo "Error: --team is required" && usage
[[ ${#SERVICES[@]} -eq 0 ]] && echo "Error: at least one --service is required" && usage

validate_dns_name "$PRODUCT" "product"
validate_dns_name "$TEAM" "team"
for svc in "${SERVICES[@]}"; do
  validate_dns_name "$svc" "service"
done

REPO_NAME="${REPO_NAME:-$PRODUCT}"
NAMESPACE_PROD="${PRODUCT}-prod"
NAMESPACE_STAGING="${PRODUCT}-staging"

echo "=== dk-template init ==="
echo "Product:    $PRODUCT"
echo "Team:       $TEAM"
echo "Repo:       $REPO_NAME"
echo "Services:   ${SERVICES[*]}"
echo "Namespaces: $NAMESPACE_PROD / $NAMESPACE_STAGING"
echo ""

# --- Detect sed variant (BSD vs GNU) ---
if sed --version 2>/dev/null | grep -q GNU; then
  SED_INPLACE=(sed -i)
else
  SED_INPLACE=(sed -i '')
fi

# --- Step 1: Duplicate template dirs for each service ---
TEMPLATE_SERVICE_DIR="$REPO_ROOT/k8s/apps/{{service}}"
TEMPLATE_GITOPS_PROD="$REPO_ROOT/.gitops/prod/apps/{{service}}.yaml"
TEMPLATE_GITOPS_STAGING="$REPO_ROOT/.gitops/staging/apps/{{service}}.yaml"
TEMPLATE_DASHBOARD="$REPO_ROOT/monitoring/dashboards/{{service}}-overview.json"
TEMPLATE_ALERTS="$REPO_ROOT/monitoring/alerts/{{service}}.yaml"

for svc in "${SERVICES[@]}"; do
  echo "Creating service: $svc"

  # K8s manifests
  if [[ -d "$TEMPLATE_SERVICE_DIR" ]]; then
    cp -R "$TEMPLATE_SERVICE_DIR" "$REPO_ROOT/k8s/apps/$svc"
  fi

  # GitOps prod app
  if [[ -f "$TEMPLATE_GITOPS_PROD" ]]; then
    cp "$TEMPLATE_GITOPS_PROD" "$REPO_ROOT/.gitops/prod/apps/$svc.yaml"
  fi

  # GitOps staging app
  if [[ -f "$TEMPLATE_GITOPS_STAGING" ]]; then
    cp "$TEMPLATE_GITOPS_STAGING" "$REPO_ROOT/.gitops/staging/apps/$svc.yaml"
  fi

  # Monitoring dashboard
  if [[ -f "$TEMPLATE_DASHBOARD" ]]; then
    cp "$TEMPLATE_DASHBOARD" "$REPO_ROOT/monitoring/dashboards/$svc-overview.json"
  fi

  # Alert rules
  if [[ -f "$TEMPLATE_ALERTS" ]]; then
    cp "$TEMPLATE_ALERTS" "$REPO_ROOT/monitoring/alerts/$svc.yaml"
  fi
done

# --- Step 2: Remove template placeholder files/dirs ---
echo "Removing template placeholders..."
rm -rf "$TEMPLATE_SERVICE_DIR"
rm -f "$TEMPLATE_GITOPS_PROD"
rm -f "$TEMPLATE_GITOPS_STAGING"
rm -f "$TEMPLATE_DASHBOARD"
rm -f "$TEMPLATE_ALERTS"

# --- Step 3: Replace placeholders in all files ---
echo "Replacing placeholders..."

replace_in_files() {
  local placeholder="$1"
  local value="$2"
  find "$REPO_ROOT" -type f \
    -not -path "$REPO_ROOT/.git/*" \
    -not -path "$REPO_ROOT/scripts/init.sh" \
    -exec grep -l "$placeholder" {} + 2>/dev/null | while read -r file; do
    "${SED_INPLACE[@]}" "s|$placeholder|$value|g" "$file"
  done
}

# Replace service placeholder in per-service copies
for svc in "${SERVICES[@]}"; do
  # Replace in service-specific files only
  for f in $(find "$REPO_ROOT/k8s/apps/$svc" \
                   "$REPO_ROOT/.gitops/prod/apps/$svc.yaml" \
                   "$REPO_ROOT/.gitops/staging/apps/$svc.yaml" \
                   "$REPO_ROOT/monitoring/dashboards/$svc-overview.json" \
                   "$REPO_ROOT/monitoring/alerts/$svc.yaml" \
                   -type f 2>/dev/null); do
    "${SED_INPLACE[@]}" "s|{{service}}|$svc|g" "$f"
  done
done

# Replace global placeholders
replace_in_files "{{namespace-prod}}" "$NAMESPACE_PROD"
replace_in_files "{{namespace-staging}}" "$NAMESPACE_STAGING"
replace_in_files "{{repo-name}}" "$REPO_NAME"
replace_in_files "{{product}}" "$PRODUCT"
replace_in_files "{{team}}" "$TEAM"

# --- Step 4: Cleanup ---
echo "Cleaning up..."
rm -rf "$REPO_ROOT/_dk-alchemy-pr/"
rm -f "$0"

# --- Step 5: Verify ---
REMAINING=$(grep -r '{{' "$REPO_ROOT" --include='*.yaml' --include='*.json' --include='*.ts' --include='*.md' -l 2>/dev/null || true)
if [[ -n "$REMAINING" ]]; then
  echo ""
  echo "WARNING: The following files still contain {{ placeholders:"
  echo "$REMAINING"
fi

echo ""
echo "=== Init complete! ==="
echo ""
echo "Next steps:"
echo "  1. Review generated manifests in k8s/ and .gitops/"
echo "  2. Update container image references in deployment.yaml files"
echo "  3. Configure Doppler project: $PRODUCT-applications"
echo "  4. Push to GitHub and verify ArgoCD picks up the app"
echo "  5. Update README.md with project-specific details"
```

### Step 2: Create ArgoCD manifests

**`.gitops/{{product}}-root-app-prod.yaml`:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{product}}-prod
  namespace: argocd
spec:
  project: {{product}}-bootstrap
  source:
    repoURL: https://github.com/data-kinetic/{{repo-name}}
    targetRevision: main
    path: .gitops/prod/apps
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

**`.gitops/{{product}}-root-app-staging.yaml`:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{product}}-staging
  namespace: argocd
spec:
  project: {{product}}-bootstrap
  source:
    repoURL: https://github.com/data-kinetic/{{repo-name}}
    targetRevision: staging
    path: .gitops/staging/apps
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

**`.gitops/prod/apps/00-project.yaml`:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: {{product}}
  namespace: argocd
spec:
  description: "{{product}} product applications"
  sourceRepos:
    - https://github.com/data-kinetic/{{repo-name}}
    - https://github.com/data-kinetic/dk-alchemy
  destinations:
    - namespace: {{namespace-prod}}
      server: https://kubernetes.default.svc
  clusterResourceWhitelist:
    - group: ''
      kind: Namespace
```

**`.gitops/staging/apps/00-project.yaml`:**

Same as prod but with `{{namespace-staging}}` destination.

**`.gitops/prod/apps/{{service}}.yaml`:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{product}}-{{service}}-prod
  namespace: argocd
spec:
  project: {{product}}
  source:
    repoURL: https://github.com/data-kinetic/{{repo-name}}
    targetRevision: main
    path: k8s/apps/{{service}}/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: {{namespace-prod}}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - ServerSideApply=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

**`.gitops/staging/apps/{{service}}.yaml`:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{product}}-{{service}}-staging
  namespace: argocd
spec:
  project: {{product}}
  source:
    repoURL: https://github.com/data-kinetic/{{repo-name}}
    targetRevision: staging
    path: k8s/apps/{{service}}/overlays/staging
  destination:
    server: https://kubernetes.default.svc
    namespace: {{namespace-staging}}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - ServerSideApply=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

**`.gitops/prod/apps/doppler-secrets.yaml`:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: {{product}}-doppler-secrets-prod
  namespace: argocd
spec:
  project: {{product}}
  source:
    repoURL: https://github.com/data-kinetic/{{repo-name}}
    targetRevision: main
    path: k8s/apps/doppler-secrets/overlays/prod
  destination:
    server: https://kubernetes.default.svc
    namespace: {{namespace-prod}}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - ServerSideApply=true
```

**`.gitops/staging/apps/doppler-secrets.yaml`:**

Same structure pointing to `k8s/apps/doppler-secrets/overlays/staging` with staging branch and namespace.

### Step 3: Create K8s manifests

**`k8s/apps/{{service}}/base/deployment.yaml`:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{service}}
  labels:
    app.kubernetes.io/name: {{service}}
    app.kubernetes.io/part-of: {{product}}
    team: {{team}}
    product: {{product}}
    service: {{service}}
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: {{service}}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{service}}
        app.kubernetes.io/part-of: {{product}}
        team: {{team}}
        product: {{product}}
        service: {{service}}
    spec:
      containers:
        - name: {{service}}
          image: ghcr.io/data-kinetic/{{repo-name}}/{{service}}:latest
          ports:
            - containerPort: 3000
              name: http
          envFrom:
            - secretRef:
                name: {{product}}-secrets
          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

**`k8s/apps/{{service}}/base/service.yaml`:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: {{service}}
  labels:
    app.kubernetes.io/name: {{service}}
spec:
  selector:
    app.kubernetes.io/name: {{service}}
  ports:
    - port: 80
      targetPort: http
      name: http
```

**`k8s/apps/{{service}}/base/kustomization.yaml`:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
commonLabels:
  app.kubernetes.io/managed-by: kustomize
```

**`k8s/apps/{{service}}/overlays/prod/kustomization.yaml`:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
components:
  - ../../../../components/doppler-secret
  - ../../../../components/otlp-collector
  - ../../../../components/hpa-production
  - ../../../../components/pdb-standard
  - ../../../../components/grafana-dashboards
  - ../../../../components/grafana-alerts
patches:
  - target:
      kind: Deployment
      name: {{service}}
    patch: |
      - op: replace
        path: /spec/replicas
        value: 2
```

**`k8s/apps/{{service}}/overlays/staging/kustomization.yaml`:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
components:
  - ../../../../components/doppler-secret
  - ../../../../components/otlp-collector
  - ../../../../components/hpa-standard
  - ../../../../components/grafana-dashboards
patches:
  - target:
      kind: Deployment
      name: {{service}}
    patch: |
      - op: replace
        path: /spec/replicas
        value: 1
```

**`k8s/apps/doppler-secrets/base/doppler-secret.yaml`:**

```yaml
apiVersion: secrets.doppler.com/v1alpha1
kind: DopplerSecret
metadata:
  name: {{product}}-secrets
spec:
  tokenSecret:
    name: doppler-token
  managedSecret:
    name: {{product}}-secrets
    type: Opaque
  project: {{product}}-applications
  config: prd
```

**`k8s/apps/doppler-secrets/base/kustomization.yaml`:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - doppler-secret.yaml
```

**`k8s/apps/doppler-secrets/overlays/prod/kustomization.yaml`:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - target:
      kind: DopplerSecret
      name: {{product}}-secrets
    patch: |
      - op: replace
        path: /spec/config
        value: prd
```

**`k8s/apps/doppler-secrets/overlays/staging/kustomization.yaml`:**

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../base
patches:
  - target:
      kind: DopplerSecret
      name: {{product}}-secrets
    patch: |
      - op: replace
        path: /spec/config
        value: stg
```

### Step 4: Create template README.md

Root `README.md` with:
- Project name and description placeholder
- Quick start (prerequisites, setup, run)
- Architecture overview placeholder
- Links to dk-planning docs

```markdown
# {{product}}

> Part of the Data Kinetic platform. Managed by the **{{team}}** team.

## Quick Start

### Prerequisites

- Docker
- kubectl configured for the target cluster
- [Doppler CLI](https://docs.doppler.com/docs/cli) (for local secrets)

### Setup

1. Clone this repo
2. Copy `.env.example` to `.env` and configure
3. Run `doppler setup` to connect to the `{{product}}-applications` project
4. Run `docker compose up` for local development

### Deploy

Deployments are automated via ArgoCD:
- **Production:** Push to `main` branch
- **Staging:** Push to `staging` branch

## Architecture

<!-- TODO: Add architecture diagram and description -->

## Services

| Service | Port | Description |
|---------|------|-------------|
| {{service}} | 3000 | <!-- TODO: describe --> |

## Documentation

- [dk-planning docs](https://github.com/data-kinetic/dk-planning)
- [Platform standards](https://github.com/data-kinetic/dk-planning/blob/main/docs/standards-tiers.md)
- [Observability guide](https://github.com/data-kinetic/dk-planning/blob/main/docs/application-instrumentation.md)
```

## dk-template Files Created

- `scripts/init.sh`
- `.gitops/{{product}}-root-app-prod.yaml`
- `.gitops/{{product}}-root-app-staging.yaml`
- `.gitops/prod/apps/00-project.yaml`
- `.gitops/prod/apps/{{service}}.yaml`
- `.gitops/prod/apps/doppler-secrets.yaml`
- `.gitops/staging/apps/00-project.yaml`
- `.gitops/staging/apps/{{service}}.yaml`
- `.gitops/staging/apps/doppler-secrets.yaml`
- `k8s/apps/{{service}}/base/deployment.yaml`
- `k8s/apps/{{service}}/base/service.yaml`
- `k8s/apps/{{service}}/base/kustomization.yaml`
- `k8s/apps/{{service}}/overlays/prod/kustomization.yaml`
- `k8s/apps/{{service}}/overlays/staging/kustomization.yaml`
- `k8s/apps/doppler-secrets/base/doppler-secret.yaml`
- `k8s/apps/doppler-secrets/base/kustomization.yaml`
- `k8s/apps/doppler-secrets/overlays/prod/kustomization.yaml`
- `k8s/apps/doppler-secrets/overlays/staging/kustomization.yaml`
- `README.md`

## Verification

- Clone dk-template, run `./scripts/init.sh --product test-app --team test-team --service api --service worker`
- Verify: no `{{` placeholders remain in any file
- Verify: `k8s/apps/api/` and `k8s/apps/worker/` exist (not `k8s/apps/{{service}}/`)
- Verify: `.gitops/prod/apps/api.yaml` and `worker.yaml` exist
- Verify: `kustomize build k8s/apps/api/overlays/prod/` succeeds (with dk-alchemy components available)
- Verify: `scripts/init.sh` no longer exists after run
