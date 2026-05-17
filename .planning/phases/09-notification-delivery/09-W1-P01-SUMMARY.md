---
phase: 09-notification-delivery
plan: 09-W1-P01
subsystem: notification
tags: [bullmq, brevo, twilio, in-app, angular, badge]
dependency_graph:
  requires: [08-W1-P01]
  provides: [NotificationModule, NotificationService, EmailBrevoProvider, SmsTwilioProvider, InAppProvider, NotificationBadgeComponent]
  affects: [AnalyticsModule, AlertDispatcherService, HeaderComponent]
tech_stack:
  added: [bullmq, @nestjs/bullmq, @getbrevo/brevo, twilio, ioredis]
  patterns: [BullMQ queue, exponential backoff retry, DLQ via UnrecoverableError, Redis sliding-window rate limiter, Angular polling badge, optimistic UI update]
key_files:
  created:
    - apps/api/src/modules/notification/notification.module.ts
    - apps/api/src/modules/notification/notification.service.ts
    - apps/api/src/modules/notification/notification.processor.ts
    - apps/api/src/modules/notification/notification.types.ts
    - apps/api/src/modules/notification/providers/email-brevo.provider.ts
    - apps/api/src/modules/notification/providers/sms-twilio.provider.ts
    - apps/api/src/modules/notification/providers/in-app.provider.ts
    - apps/api/src/modules/notification/entities/notification.entity.ts
    - apps/api/src/modules/notification/notification.controller.ts
    - apps/api/src/modules/notification/migrations/1720000000000__create_notification.sql
    - apps/web/src/app/layout/notification-badge.component.ts
  modified:
    - apps/api/src/modules/analytics/services/alert-dispatcher.service.ts
    - apps/api/src/modules/analytics/analytics.module.ts
    - apps/web/src/app/layout/header.component.ts
    - apps/api/src/app.module.ts
decisions:
  - One BullMQ job per recipient per channel — each independently retryable, observable in Bull Board
  - NTF_DRY_RUN=true is the default in dev — queue always drains (audit symmetry), SDK calls are skipped
  - SMS rate limiter: 3 SMS/hour/phone via Redis sorted-set sliding window; degrades to open when Redis unavailable
  - NotificationService imported into AnalyticsModule via NotificationModule — no circular dependency since NotificationModule has no domain imports
  - Angular badge uses 30s polling for v1.1; SSE can replace polling when broadcaster is set up
  - Optimistic UI: markRead() and markAllRead() update local signal state immediately without waiting for next poll
  - AlertDispatcherService replaces EmailProvider/SmsProvider injection with NotificationService — removes the old logger.log() stub path entirely
metrics:
  duration: 4 minutes
  completed_date: "2026-05-17"
  tasks_completed: 5
  files_changed: 14
---

# Phase 09 Plan 01: BullMQ Notification Workers + Email/SMS Providers Summary

**One-liner:** BullMQ notification queue with Brevo email, Twilio SMS, and Angular header badge — replaces all logger.log() stubs with real async delivery.

## What Was Built

### NTF-01-T01: NotificationModule + BullMQ Queue

- `NotificationModule` registers the `'notifications'` BullMQ queue backed by ioredis
- `NotificationService.dispatch(payload)` enqueues one job per recipient with 5-attempt exponential backoff (30s base, capped at 30min)
- `NotificationProcessor` drains the queue and routes by channel (`email` | `sms` | `in_app`)
- Tenant CLS context is injected per-job so in-app DB writes are RLS-scoped
- Failed/retryable=false jobs throw `UnrecoverableError` → BullMQ DLQ immediately
- `NotificationJobPayload` type is the single canonical job shape: `{ tenantId, channel, recipient, templateKey, payload, metadata }`

### NTF-01-T02: Email Provider — Brevo

- `EmailBrevoProvider` wraps `@getbrevo/brevo` SDK (BrevoClient v5 API)
- Config: `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
- Locale-aware HTML email renderer: FR/EN, per-severity color, XSS-escaped
- `NTF_DRY_RUN=true` (default dev) → `skipped/dry_run` — no HTTP call
- Brevo 4xx → `failed/retryable=false` (DLQ); 5xx/network → throw (BullMQ retry)

### NTF-02-T01: SMS Provider — Twilio

- `SmsTwilioProvider` wraps the official `twilio` SDK
- Config: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- Per-recipient rate limiter: max 3 SMS/hour/phone via Redis sorted-set sliding window
- SMS body capped at 480 chars (3 Twilio segments max)
- Twilio 21xxx error codes → non-retryable DLQ; other errors → BullMQ retry
- `SmsRateLimiter` duck-typed against `IRedisClient` for test friendliness

### NTF-03-T01: Replace AlertDispatcher Stubs

- `AlertDispatcherService` (analytics module) now injects `NotificationService` instead of `EmailProvider`/`SmsProvider`
- `deliverThroughChannel()` enqueues one BullMQ job per recipient per channel
- All logger.log() stub paths removed — delivery is fully async via BullMQ
- `AnalyticsModule` imports `NotificationModule`; old `EmailProvider`/`SmsProvider` providers removed
- `toNotifSeverity()` maps analytics severity enum to notification severity enum at the module boundary

### NTF-03-T02: In-App Notification Badge

Backend:
- `Notification` entity: `id`, `tenant_id`, `user_id`, `alert_id`, `title`, `body`, `severity`, `event_type`, `read_at_utc`
- SQL migration: RLS policy + unique index on `(tenant_id, user_id, alert_id)` WHERE alert_id IS NOT NULL
- `GET /api/notifications?unread=true` → `{ unreadCount, items[10] }` ordered by `created_at_utc DESC`
- `PATCH /api/notifications/:id/read` → sets `read_at_utc = now()`
- `PATCH /api/notifications/read-all` → bulk update + returns `updated` count
- `InAppProvider` persists notification row; idempotent on `(tenant, user, alert_id)` via find-then-insert

Angular:
- `NotificationBadgeComponent` polls `/api/notifications?unread=true` every 30s
- `MatBadge` on bell icon shows unread count; hidden when 0
- Dropdown panel with severity dot, title, body, relative timestamp (FR locale)
- Click row → PATCH mark-read with optimistic signal update (no round-trip delay)
- "Tout lire" button → bulk mark-all-read
- Backdrop closes dropdown on outside click
- `ChangeDetectionStrategy.OnPush` for performance
- Wired into `HeaderComponent` between locale switcher and logout button

## Commits

| Hash | Task | Description |
|------|------|-------------|
| 0d352f9 | NTF-01-T01 | NotificationModule + BullMQ queue setup |
| 15a79f2 | NTF-01-T02 | Email provider integration — Brevo |
| ba52972 | NTF-02-T01 | SMS provider integration — Twilio |
| f08fd37 | NTF-03-T01 | Wire AlertDispatcherService to BullMQ NotificationService |
| 6319f8a | NTF-03-T02 | In-app notification badge + backend entity+controller |

## Verification

- [x] No `logger.log()` stubs remain in AlertDispatcherService for delivery
- [x] BullMQ queue configured: 5 attempts, exponential backoff, DLQ via UnrecoverableError
- [x] Email → Brevo SDK (dry_run default; real send when BREVO_API_KEY set)
- [x] SMS → Twilio SDK (dry_run default; real send when TWILIO_* env vars set)
- [x] In-app notifications persisted to DB, polled by Angular badge every 30s
- [x] Badge badge shows unread count, decrements on click (optimistic)

## Deviations from Plan

### Auto-detected: AlertDispatcherService location

**Found during:** NTF-03-T01 planning
**Issue:** The plan referred to `AlertDispatcherService` as being in the alerts module, but it lives in `apps/api/src/modules/analytics/services/`. No `AlertDispatcherService` existed in the alerts module.
**Fix:** Targeted the actual location in AnalyticsModule. Modified `analytics.module.ts` to import `NotificationModule` instead of alerting module.
**Impact:** None on behavior — correct service was wired.

### Auto-detected: notification-badge path

**Found during:** NTF-03-T02
**Issue:** Plan specified `apps/web/src/app/layout/header/notification-badge.component.ts` (in a `header/` subdirectory) but `HeaderComponent` and all layout components live flat in `layout/`. Creating a subdirectory would require updating the import path.
**Fix:** Created `notification-badge.component.ts` directly in `layout/` alongside `header.component.ts` — consistent with the existing file layout.

## Known Stubs

None. All provider SDK calls are real (guarded by `NTF_DRY_RUN` env var which defaults to dry_run in dev for safety). The badge data source is fully wired to the real database endpoint.

## Self-Check: PASSED

All 12 key files verified present on disk. All 5 task commits found in git history.
