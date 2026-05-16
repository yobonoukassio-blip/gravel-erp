---
phase: 09-notification-delivery
plan: 09-W1-P01
title: "BullMQ Notification Workers + Email/SMS Providers"
wave: 1
requirements_covered: [NTF-01, NTF-02, NTF-03]
depends_on: ["08-W1-P01"]
tasks:
  - id: NTF-01-T01
    title: "NotificationModule + BullMQ queue setup"
    files_modify: ["apps/api/src/modules/notification/"]
    test: "Queue accepts jobs and processes them"
  - id: NTF-01-T02
    title: "Email provider integration (Brevo)"
    files_modify: ["apps/api/src/modules/notification/providers/"]
    test: "Email sent to Brevo sandbox"
  - id: NTF-02-T01
    title: "SMS provider integration (Twilio)"
    files_modify: ["apps/api/src/modules/notification/providers/"]
    test: "SMS sent to Twilio test number"
  - id: NTF-03-T01
    title: "Replace AlertDispatcherService stubs with queue dispatch"
    files_modify: ["apps/api/src/modules/alerts/"]
    test: "Alert triggers real email+SMS jobs in queue"
  - id: NTF-03-T02
    title: "In-app notification badge (Angular header)"
    files_modify: ["apps/web/src/app/layout/"]
    test: "Badge shows unread count, decrements on click"
---

# Plan: BullMQ Notification Workers + Email/SMS Providers

**Phase:** 09-notification-delivery
**Goal:** Les alertes arrivent par email et SMS — fin des stubs logger.log().
**Requirements:** NTF-01, NTF-02, NTF-03

## Task 1: NotificationModule + BullMQ Queue (NTF-01-T01)

**What:** Create a NestJS NotificationModule with BullMQ queue for async notification delivery.

**Files to create:**
- `apps/api/src/modules/notification/notification.module.ts`
- `apps/api/src/modules/notification/notification.service.ts`
- `apps/api/src/modules/notification/notification.processor.ts`
- `apps/api/src/modules/notification/notification.types.ts`

**Implementation:**
1. `NotificationModule` imports `BullModule.registerQueue({ name: 'notifications' })`
2. `NotificationService.dispatch(payload: NotificationPayload)` adds job to queue
3. `NotificationProcessor` (`@Processor('notifications')`) routes by channel (email/sms/in-app)
4. Retry config: 3 attempts, exponential backoff (1s, 4s, 16s), dead-letter after exhaustion
5. `NotificationPayload`: `{ channel: 'email'|'sms'|'in_app', recipient, subject?, body, metadata }`

**Test criteria:**
- Job added to queue -> processor picks it up
- Failed job retries 3 times then moves to dead-letter

## Task 2: Email Provider — Brevo (NTF-01-T02)

**What:** Integrate Brevo (ex-SendinBlue) transactional email API.

**Files to create:**
- `apps/api/src/modules/notification/providers/email-brevo.provider.ts`

**Implementation:**
1. Use `@getbrevo/brevo` SDK (or raw fetch to `https://api.brevo.com/v3/smtp/email`)
2. Config: `BREVO_API_KEY` env var, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`
3. Method: `send(to: string, subject: string, htmlContent: string): Promise<void>`
4. If env var missing, log warning but don't crash (graceful degradation for dev)

**Test criteria:**
- With valid API key: email appears in Brevo activity log
- With missing API key: logs warning, job marked failed (retry won't help, goes to DLQ)

## Task 3: SMS Provider — Twilio (NTF-02-T01)

**What:** Integrate Twilio SMS API for high-severity alerts.

**Files to create:**
- `apps/api/src/modules/notification/providers/sms-twilio.provider.ts`

**Implementation:**
1. Use `twilio` npm SDK
2. Config: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
3. Method: `send(to: string, body: string): Promise<void>`
4. Only called for alerts with severity >= 'high'
5. Graceful degradation if env vars missing (same pattern as email)

**Test criteria:**
- With valid creds: SMS delivered to test number
- With missing creds: logs warning, DLQ

## Task 4: Replace AlertDispatcher Stubs (NTF-03-T01)

**What:** Wire AlertDispatcherService to use NotificationService instead of logger.log().

**Files to modify:**
- `apps/api/src/modules/alerts/services/alert-dispatcher.service.ts`
- `apps/api/src/modules/alerts/alerts.module.ts` (import NotificationModule)

**Implementation:**
1. Inject `NotificationService` into `AlertDispatcherService`
2. Replace each `this.logger.log('Would send email...')` with:
   ```typescript
   await this.notifications.dispatch({
     channel: 'email',
     recipient: rule.recipient_email,
     subject: `[Gravel Alert] ${alert.title}`,
     body: this.buildAlertEmailHtml(alert),
     metadata: { alertId: alert.id, ruleId: rule.id },
   });
   ```
3. For severity >= 'high', also dispatch SMS channel
4. For all alerts, dispatch 'in_app' channel (writes to `notification` table for badge)

**Test criteria:**
- Alert created -> NotificationService.dispatch called (not logger.log)
- High severity -> both email AND sms dispatched
- All alerts -> in_app notification created

## Task 5: In-App Notification Badge (NTF-03-T02)

**What:** Angular header badge showing unread notification count.

**Files to create/modify:**
- `apps/api/src/modules/notification/entities/notification.entity.ts` (NEW)
- `apps/api/src/modules/notification/notification.controller.ts` (NEW — GET /notifications, PATCH /notifications/:id/read)
- `apps/web/src/app/layout/header/notification-badge.component.ts` (NEW)
- `apps/web/src/app/layout/header/header.component.html` (add badge)

**Implementation:**
1. `notification` table: `id, tenant_id, user_id, alert_id, title, body, read_at, created_at_utc`
2. `GET /api/notifications?unread=true` returns count + latest 10
3. `PATCH /api/notifications/:id/read` sets `read_at = now()`
4. Angular badge uses polling every 30s (SSE later if needed)
5. Click badge -> opens dropdown with latest notifications -> click marks as read

**Test criteria:**
- Unread count shows in badge
- Marking as read decrements count
- New alert creates in_app notification automatically

## Verification

After all tasks:
- No `logger.log` stubs remain in AlertDispatcherService for delivery
- BullMQ queue processes jobs with retry
- Email + SMS send to real providers (verifiable in provider dashboards)
- Angular badge updates on new notifications
