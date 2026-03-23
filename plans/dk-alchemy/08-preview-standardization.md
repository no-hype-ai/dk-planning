# Preview Environment Standardization

## Context
VM101 (preview-stack) runs ad-hoc docker-compose projects with Nginx Proxy Manager. No standard deployment pattern, manual SSH, no cleanup. Additionally, K8s per-PR ephemeral environments are planned but not implemented.

## Scope
- Standardize VM-based previews via Platform API + dk-cli
- Create docker-compose.preview.yaml template in dk-template
- Automate NPM proxy host configuration
- Implement TTL-based cleanup
- Design K8s per-PR preview environments (ArgoCD ApplicationSet + pull-request generator)

## Dependencies
- Plan 01 (Platform API) — preview endpoints needed for orchestration
- dk-template — generates preview docker-compose config

## Existing Work
- dk-alchemy: k8s/edge/routes/base/preview-stack.yaml, datakinetic-preview.yaml
- dk-alchemy specs: 009-infra-evolution (preview stack as P3)
- dk-planning docs: preview-environments.md, gitops-and-cd.md (K8s previews)

## Implementation Steps

### Phase 1: VM Preview Standardization
1. Create standard docker-compose.preview.yaml template in dk-template:
   - Service definitions matching K8s deployment
   - .env.preview file with Doppler injection points
   - Health check endpoints
   - Standard port mappings
2. Implement Platform API preview endpoints (POST/GET/DELETE /dk/v1/previews):
   - SSH to VM101 (10.0.0.51) using key from Doppler
   - Clone repo/branch to /opt/previews/<name>/
   - Run `doppler run -- docker-compose -f docker-compose.preview.yaml up -d`
   - Configure NPM proxy host via NPM API: <name>.preview.behaviorlabs.ai → localhost:<port>
   - Return preview URL
3. Implement `dk preview up/down/list/logs` in dk-cli
4. Add TTL-based cleanup:
   - Default TTL: 7 days
   - Platform API cron job checks preview age, tears down expired
   - Warning at 6 days (Slack notification to deployer)
5. Create preview management dashboard in Grafana

### Phase 2: K8s Per-PR Previews (Future)
6. Create ArgoCD ApplicationSet with pull-request generator:
   - On PR open: create `<app>-preview-<pr>` namespace
   - Deploy from PR branch using product repo's k8s/ manifests
   - IngressRoute at `pr-<number>.preview.<domain>`
   - On PR close/merge: prune namespace (ArgoCD automated cleanup)
7. Add PR comment bot that posts preview URL
8. Resource limits on preview namespaces (prevent cluster overload)

## dk-alchemy Changes
- MODIFY: src/platform-api/ (add preview endpoints)
- CREATE: docs/runbooks/preview-management.md
- For Phase 2: CREATE k8s ApplicationSet for PR previews

## Other Repo Changes
- MODIFY: dk-template (add docker-compose.preview.yaml, .env.preview)

## Verification
- `dk preview up` from a product repo creates working preview at *.preview.behaviorlabs.ai
- `dk preview list` shows active previews with URLs and age
- Preview auto-cleans after TTL expiry
- NPM proxy host is configured correctly (HTTPS works)

## Options/Recommendations
**Preview cleanup:**
- **Option A (Recommended): TTL-based** — 7-day default, configurable. Simple, predictable.
- **Option B: PR-linked** — Tear down when source branch is deleted or PR is merged. More responsive but requires GitHub webhook integration.
**Recommendation:** Start with TTL (Option A), add PR-linked cleanup when Platform API webhooks are deployed.
