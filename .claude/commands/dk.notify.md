---
description: "Send a coordination message to Slack — progress updates to #dk-infrastructure, escalations/blockers DM'd to Nick King."
---

# DK Slack Notification

## User Input

```text
$ARGUMENTS
```

Parse the arguments:
- If starts with "dm" or "escalate": DM Nick King (remove the prefix, send the rest as the message)
- Otherwise: post to #dk-infrastructure channel

## Execution

### Option 1: Use Slack Skill (preferred)

Use the `slack:draft-announcement` or `slack:slack-messaging` skill to compose and send the message.

For channel messages:
- Target: #dk-infrastructure
- Format with Slack mrkdwn (bold, bullets, etc.)

For DMs to Nick King:
- Search for Nick King in Slack
- Send as direct message
- Prefix with ":rotating_light:" for escalations

### Option 2: Webhook Fallback

If Slack skills are unavailable, use the webhook script:

```bash
/Users/nick/Code/dk-planning/scripts/dk-notify.sh "MESSAGE" "#dk-infrastructure"
```

### Message Templates

**Progress update:**
```
:white_check_mark: *{REPO} #{ISSUE_NUMBER}* — {TITLE}
Status: Completed
{BRIEF_DESCRIPTION_OF_WHAT_WAS_DONE}
```

**Escalation (DM):**
```
:rotating_light: *Blocker — {REPO} #{ISSUE_NUMBER}*
{WHAT_IS_BLOCKED}
*Action needed:* {WHAT_NICK_NEEDS_TO_DO}
```

**Breaking change warning (DM):**
```
:warning: *Breaking change incoming — {REPO}*
{WHAT_IS_CHANGING}
*Impact:* {WHAT_MIGHT_BREAK}
Proceeding in 5 minutes unless you respond.
```

**Phase completion:**
```
:tada: *Phase {N} Complete — {PHASE_NAME}*
Closed: {COUNT} issues across {REPOS}
• dk-alchemy: {DETAILS}
• dk-clusters: {DETAILS}
• dk-template: {DETAILS}
Next: Phase {N+1} — {NEXT_PHASE_NAME}
```
