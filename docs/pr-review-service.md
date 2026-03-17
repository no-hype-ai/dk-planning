# PR Review Service

## Overview

An automated PR review service that evaluates pull requests against platform standards, security policies, and code quality rubrics. Runs as a **separate service on lithium-5** (krang GPUs), receiving PR events from the [webhook service](self-hosted-runners-and-webhooks.md) and posting reviews back to GitHub.

## Architecture Decision

The PR review service is a **separate service in lithium-5**, not an extension of the webhook service. Rationale:

- PR review requires **GPU inference** (long-running, resource-heavy) — fundamentally different from the webhook service's lightweight event routing
- Fits lithium-5's role as the **agent execution fabric** running on krang's A100 GPUs
- Decouples review latency from webhook processing — a slow review doesn't block kustomize updates or Slack notifications

## Event Flow

```
GitHub PR event (opened/synchronize on staging branch)
  → webhook-service (dk-alchemy): validates HMAC, routes PR events
    → lithium-5 pr-critic service (krang): fetches diff, runs evaluation
      → GitHub PR review (approve/comment/request changes)
```

Only PRs targeting **staging branches** are reviewed. Production PRs (release tags, main branch) follow the existing approval workflow.

## Service Structure

```
lithium-5/
  services/pr-critic/
    main.py                # FastAPI service
    critic.py              # CriticBase subclass (DKPlatformCritic)
    rubrics/
      security.py          # Secret patterns, auth, injection
      observability.py     # Instrumentation, health endpoints, error handling
      standards.py         # Platform standards (auto-generated from Capability B definitions)
      code_quality.py      # Abstractions, naming, test coverage
    config.py              # Pydantic settings
    github_client.py       # GitHub App API client for posting reviews
    prompts/
      system.md            # System prompt for the review model
      rubric_template.md   # Rubric evaluation template
```

## OpenHands SDK Integration

The service is built on the OpenHands SDK's `CriticBase` class:

```python
from openhands.critic import CriticBase, CriticResult, IterativeRefinementConfig

class DKPlatformCritic(CriticBase):
    config = IterativeRefinementConfig(
        success_threshold=0.7,
        max_iterations=1  # Single-pass review, not iterative
    )

    async def evaluate(self, pr_context) -> CriticResult:
        rubric_results = await asyncio.gather(
            self.security_rubric.evaluate(pr_context),
            self.observability_rubric.evaluate(pr_context),
            self.standards_rubric.evaluate(pr_context),
            self.code_quality_rubric.evaluate(pr_context),
        )
        score = weighted_average(rubric_results)
        return CriticResult(score=score, message=format_review(rubric_results))
```

## Rubrics

### Rubric Weights

| Rubric | Weight | What It Checks |
|--------|--------|---------------|
| **Security** | 0.30 | No secrets in code, safe auth patterns, no injection vulnerabilities, safe dependency usage |
| **Platform Standards** | 0.25 | Kustomize patterns, required labels, image tags, webhook integration (auto-generated from [Standards Compliance](standards-compliance.md) definitions) |
| **Code Quality** | 0.25 | Appropriate abstractions, consistent naming, test coverage, documentation |
| **Observability** | 0.20 | OTel instrumentation, health endpoints, `parseError()` usage, structured logging |

### Security Rubric

Checks for:
- Hardcoded secrets, API keys, tokens, or passwords
- SQL injection, command injection, XSS patterns
- Unsafe authentication or authorization patterns
- Known vulnerable dependency patterns
- Secrets committed to `.env` files or config

### Observability Rubric

Checks for:
- `@datakinetic/observability` (or `@repo/observability`) imported in new services
- `parseError()` used for error handling (not bare `console.error`)
- Health endpoints (`/health`, `/ready`) present
- Custom spans for significant operations
- Structured logging (not `console.log` in production code)

### Standards Rubric

Auto-generated from `data-kinetic/.github/standards/*.yaml` — the same definitions used by the [Standards Compliance](standards-compliance.md) CI checks. Evaluates:
- Kustomize overlay patterns and required components
- Required Kubernetes labels
- Image tag format compliance
- Webhook notification step in CI workflows
- Resource requests and limits

### Code Quality Rubric

Checks for:
- Premature abstractions or over-engineering
- Inconsistent naming conventions
- Missing tests for new functionality
- Dead code or unused imports
- Large functions that should be decomposed

## Review Thresholds

| Score | Action | Blocking? |
|-------|--------|-----------|
| >= 0.7 | **Approve** with improvement suggestions as inline comments | No |
| 0.4–0.7 | **Comment** with specific feedback per rubric | No |
| < 0.4 | **Request changes** with blocking feedback and required fixes | Yes |

## Model

Self-hosted on krang via vLLM. Configurable — default: a strong code model routed through lithium-5's existing LiteLLM proxy.

```
CRITIC_MODEL=qwen2.5-coder-32b-instruct
```

Can be changed to any model available via LiteLLM without service redeployment.

## Deployment

### K8s Manifests

```
lithium-5/
  k8s/apps/pr-critic/
    base/
      deployment.yaml      # 1 replica, GPU resource request (1x A100)
      service.yaml         # ClusterIP :8000
      kustomization.yaml
    overlays/prod/
      kustomization.yaml   # nodeAffinity: krang
```

The deployment uses `nodeAffinity` to schedule on krang (GPU node) and requests 1x A100 GPU via `nvidia.com/gpu: 1` resource.

### Doppler Configuration

Add to lithium-5's Doppler project (`lithium5-applications`):

| Key | Value | Purpose |
|-----|-------|---------|
| `CRITIC_MODEL` | `qwen2.5-coder-32b-instruct` | Model for code review |
| `CRITIC_SUCCESS_THRESHOLD` | `0.7` | Score threshold for auto-approve |
| `CRITIC_SECURITY_WEIGHT` | `0.30` | Security rubric weight |
| `CRITIC_OBSERVABILITY_WEIGHT` | `0.20` | Observability rubric weight |
| `CRITIC_STANDARDS_WEIGHT` | `0.25` | Standards rubric weight |
| `CRITIC_CODE_QUALITY_WEIGHT` | `0.25` | Code quality rubric weight |
| `CRITIC_ENABLED_REPOS` | `behavior-labs-ai,carbon-5,lithium-5,DK-OS` | Repos that receive automated reviews |
| `GITHUB_APP_ID` | (from GitHub App) | For posting reviews |
| `GITHUB_APP_PRIVATE_KEY` | (from GitHub App) | For posting reviews |

### Webhook Service Handler

The webhook service in dk-alchemy includes a handler that forwards PR events to lithium-5. See [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md#pr-event-forwarding) for the handler implementation.

## Integration with Standards Compliance

```
Standards Definitions (data-kinetic/.github/standards/*.yaml)
  │
  ├──► CI Standards Check (Capability B)
  │     └── Pass/fail on PRs before merge
  │
  └──► PR Critic Standards Rubric (Capability C)
        └── Nuanced review with context-aware feedback
```

The CI standards check is a hard gate (pass/fail). The PR critic provides softer, more contextual feedback — it can explain *why* a pattern is problematic and suggest alternatives, not just flag violations.

### Feedback Loop

When the critic identifies recurring patterns across PRs (e.g., many PRs missing health endpoints), this signals that:
1. A new standard rule should be added to the [Standards Compliance](standards-compliance.md) definitions
2. The [doc-gap scanner](issue-governance.md#doc-gap-scanner-integration) should create tracking issues for existing non-compliance

## Related Documentation

- [Self-Hosted Runners & Webhook Service](self-hosted-runners-and-webhooks.md) — webhook service that routes PR events
- [Standards Compliance](standards-compliance.md) — shared standards definitions consumed by the critic
- [Security & Compliance](security-and-compliance.md) — security policies enforced by the security rubric
- [Platform Overview](platform-overview.md) — lithium-5 as the agent execution fabric
- [Observability](observability.md) — observability requirements enforced by the observability rubric
- [CI/CD Pipelines](ci-cd-pipelines.md) — CI context for PR reviews
