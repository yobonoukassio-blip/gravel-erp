---
phase: 09-notification-delivery
verified: 2026-05-17T14:00:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 09: Notification Delivery — Verification Report

**Phase Goal:** Les alertes arrivent par email et SMS — fin des stubs logger.log().
**Verified:** 2026-05-17T14:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | AlertDispatcherService enqueues real BullMQ jobs instead of calling logger.log() stubs | VERIFIED | `alert-dispatcher.service.ts` L234: `await this.notifications.dispatch(payload)` — no logger.log() stub remains for delivery |
| 2 | Email alerts reach a real Brevo SDK call (guarded by NTF_DRY_RUN in dev) | VERIFIED | `email-brevo.provider.ts` L68: `this.client.transactionalEmails.sendTransacEmail(...)` — real SDK call, not a stub |
| 3 | SMS alerts reach a real Twilio SDK call for severity >= high | VERIFIED | `sms-twilio.provider.ts` L69: `this.client.messages.create(...)` — real Twilio client call |
| 4 | In-app notifications are persisted to DB and polled by Angular header badge | VERIFIED | `InAppProvider.send()` persists `Notification` entity; `NotificationBadgeComponent` polls `/api/notifications?unread=true` every 30s |
| 5 | Angular header badge shows unread count and marks notifications as read | VERIFIED | `header.component.ts` L44: `<gravel-notification-badge />` wired in header; badge uses optimistic signal updates on click |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `apps/api/src/modules/notification/notification.module.ts` | NestJS module wiring BullMQ queue | VERIFIED | Registers `notifications` queue, exports `NotificationService` |
| `apps/api/src/modules/notification/notification.service.ts` | BullMQ producer facade | VERIFIED | `dispatch()` enqueues with 5 attempts, exponential backoff 30s, dedup by alertId |
| `apps/api/src/modules/notification/notification.processor.ts` | BullMQ worker routing by channel | VERIFIED | `@Processor('notifications')`, routes email/sms/in_app, `UnrecoverableError` for non-retryable |
| `apps/api/src/modules/notification/notification.types.ts` | Shared types for queue | VERIFIED | `NotificationJobPayload`, `NotificationOutcome`, `NOTIFICATION_QUEUE_NAME` |
| `apps/api/src/modules/notification/providers/email-brevo.provider.ts` | Brevo email provider | VERIFIED | Wraps `@getbrevo/brevo` SDK, graceful degradation, locale-aware renderer, XSS-escaped HTML |
| `apps/api/src/modules/notification/providers/sms-twilio.provider.ts` | Twilio SMS provider | VERIFIED | Wraps `twilio` SDK, Redis sliding-window rate limiter (3/hr/phone), 480-char cap |
| `apps/api/src/modules/notification/providers/in-app.provider.ts` | In-app DB persistence | VERIFIED | TypeORM `Notification` repo, idempotent on (tenant, user, alert_id) |
| `apps/api/src/modules/notification/entities/notification.entity.ts` | TypeORM entity for notification table | VERIFIED | All required columns: id, tenant_id, user_id, alert_id, title, body, severity, event_type, read_at_utc |
| `apps/api/src/modules/notification/notification.controller.ts` | REST API for badge | VERIFIED | GET /notifications?unread=true, PATCH /:id/read, PATCH /read-all |
| `apps/api/src/modules/notification/migrations/1720000000000__create_notification.sql` | DB migration | VERIFIED | Table + RLS policy + two indexes (unread query, idempotency) |
| `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts` | AlertDispatcher using NotificationService | VERIFIED | Injects `NotificationService`, `deliverThroughChannel()` calls `this.notifications.dispatch()` |
| `apps/web/src/app/layout/notification-badge.component.ts` | Angular badge component | VERIFIED | 348 lines, polls API, `MatBadge`, optimistic `markRead`/`markAllRead`, backdrop close, `OnPush` |
| `apps/web/src/app/layout/header.component.ts` | Header wires badge | VERIFIED | Imports `NotificationBadgeComponent`, renders `<gravel-notification-badge />` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `AlertDispatcherService` | `NotificationService.dispatch()` | Constructor injection in `analytics.module.ts` | WIRED | `analytics.module.ts` imports `NotificationModule`; `AlertDispatcherService` constructor receives `NotificationService` |
| `NotificationService` | BullMQ `notifications` queue | `@InjectQueue(NOTIFICATION_QUEUE_NAME)` | WIRED | `queue.add(NOTIFICATION_JOB_NAME, payload, ...)` |
| `NotificationProcessor` | `EmailBrevoProvider` | Constructor DI | WIRED | `this.email.send(payload)` on `channel === 'email'` |
| `NotificationProcessor` | `SmsTwilioProvider` | Constructor DI | WIRED | `this.sms.send(payload)` on `channel === 'sms'` |
| `NotificationProcessor` | `InAppProvider` | Constructor DI | WIRED | `this.inApp.send(payload)` on `channel === 'in_app'` |
| `NotificationBadgeComponent` | `/api/notifications?unread=true` | `HttpClient.get()` every 30s | WIRED | `interval(30000).pipe(startWith(0), switchMap(...))` |
| `NotificationBadgeComponent.markRead()` | `PATCH /api/notifications/:id/read` | `HttpClient.patch()` | WIRED | Optimistic signal update, no round-trip delay |
| `HeaderComponent` | `NotificationBadgeComponent` | Import + template tag | WIRED | `imports: [NotificationBadgeComponent]`, `<gravel-notification-badge />` |
| `NotificationModule` | `AppModule` | `imports` array | WIRED | `app.module.ts` includes `NotificationModule` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `NotificationBadgeComponent` | `unreadCount`, `items` | `GET /api/notifications?unread=true` | Yes — `NotificationController.list()` queries `Notification` repo with TypeORM, RLS-scoped | FLOWING |
| `NotificationController` | `items`, `unreadCount` | TypeORM `Repository<Notification>.find()` + `.count()` | Yes — DB queries with `readAtUtc: IsNull()` filter | FLOWING |
| `InAppProvider` | Writes `Notification` row | `repo.save(row)` | Yes — real TypeORM save, idempotent via find-then-insert | FLOWING |
| `AlertDispatcherService` | `recipients` | `DataSource.query()` from `user` table | Yes — parameterized SQL against real `user` table | FLOWING |
| `EmailBrevoProvider` | Email send | `BrevoClient.transactionalEmails.sendTransacEmail()` | Yes in prod (real SDK); skipped in dev when `NTF_DRY_RUN=true` (default) | FLOWING |
| `SmsTwilioProvider` | SMS send | `Twilio.messages.create()` | Yes in prod (real SDK); skipped in dev when `NTF_DRY_RUN=true` | FLOWING |

**Note on dry-run posture:** `NTF_DRY_RUN` defaults to `true` (i.e., `process.env['NTF_DRY_RUN'] !== 'false'`). This means in dev/CI environments without the flag explicitly set to `'false'`, both Brevo and Twilio SDK calls are skipped. The queue is still drained and outcomes logged — this is intentional, documented, and does not constitute a stub. Setting `NTF_DRY_RUN=false` plus the respective API keys enables real delivery.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Required packages present in package.json | `grep "@getbrevo/brevo"\|"twilio"\|"bullmq"\|"@nestjs/bullmq"\|"ioredis"` in `apps/api/package.json` | All 5 packages found at locked versions | PASS |
| No logger.log() stubs remain in AlertDispatcherService | grep for `Would send email\|Would send SMS\|logger\.log.*email` | No matches | PASS |
| AlertDispatcherService calls notifications.dispatch | grep for `this\.notifications\.dispatch` | Found at L234 | PASS |
| NotificationBadgeComponent wired in HeaderComponent | grep for `gravel-notification-badge` in header template | Found at L44 | PASS |
| All 5 task commits present in git history | `git log --oneline` | 0d352f9, 15a79f2, ba52972, f08fd37, 6319f8a all present | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| NTF-01 | 09-W1-P01 | Provider email (Brevo) via BullMQ — alert_rule triggers email to configured recipients | SATISFIED | `EmailBrevoProvider` wraps `@getbrevo/brevo` SDK; `NotificationProcessor` routes email jobs; `AnalyticsModule` imports `NotificationModule` |
| NTF-02 | 09-W1-P01 | Provider SMS (Twilio) via BullMQ — severity >= high triggers SMS to site manager | SATISFIED | `SmsTwilioProvider` wraps `twilio` SDK; severity mapping in `toNotifSeverity()` in `AlertDispatcherService`; SMS rate limiter (3/hr/phone) implemented |
| NTF-03 | 09-W1-P01 | logger.log() stubs in AlertDispatcherService replaced by real job queue calls | SATISFIED | `deliverThroughChannel()` calls `this.notifications.dispatch(payload)` — no logger.log() stub path remains; confirmed by grep of production file |

No orphaned requirements found. REQUIREMENTS.md traceability table maps NTF-01, NTF-02, NTF-03 exclusively to `09-notification-delivery` — all three are accounted for by `09-W1-P01`.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `notification.module.ts` | 27 | `return null` | INFO | Intentional: Redis client returns null when `REDIS_URL` unset — gracefully degrades SMS rate limiter to open. Not a stub. |
| `email-brevo.provider.ts` | 156 | `return null` in `extractHttpStatus` | INFO | Error introspection helper — returns null when error has no HTTP status. Not a stub. |

No blockers. No warnings. Both `return null` instances are defensive null-checks in error handling, not stub data flows.

---

### Human Verification Required

#### 1. Real Email Delivery (Brevo)

**Test:** Set `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `NTF_DRY_RUN=false`, start the API, trigger an alert event, check Brevo activity log.
**Expected:** Transactional email appears in Brevo dashboard for the configured recipient.
**Why human:** Requires live Brevo credentials and network access to verify the SDK call completes; cannot verify without running the server against real API.

#### 2. Real SMS Delivery (Twilio)

**Test:** Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `NTF_DRY_RUN=false`, trigger a high-severity alert event.
**Expected:** SMS received on the configured test number, Twilio dashboard shows the message.
**Why human:** Requires live Twilio credentials and a real phone number; cannot verify programmatically without external services.

#### 3. Badge Visual + Unread Count Decrement

**Test:** Log in as a user with unread in-app notifications, observe bell icon badge count, click a notification row.
**Expected:** Badge shows correct unread count; clicking a notification marks it read (count decrements by 1 immediately due to optimistic update); re-loading page shows the same lower count.
**Why human:** Angular polling and signal-based optimistic UI requires a running browser with a live backend.

#### 4. Bulk Mark-All-Read

**Test:** With multiple unread notifications, click "Tout lire" button.
**Expected:** All notifications marked read, badge count drops to 0, button disappears.
**Why human:** Requires browser interaction to verify the bulk PATCH and UI update together.

---

### Gaps Summary

No gaps. All 5 observable truths are verified. All 13 key artifacts exist and are substantive (no stubs). All 9 key links are wired. Data flows are real (DB reads/writes, SDK calls guarded by dry-run). Requirements NTF-01, NTF-02, NTF-03 are fully satisfied with no orphaned requirements.

The dry-run default (`NTF_DRY_RUN=true`) is the only caveat — it is deliberate and documented as a dev safety posture, not a gap.

---

_Verified: 2026-05-17T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
