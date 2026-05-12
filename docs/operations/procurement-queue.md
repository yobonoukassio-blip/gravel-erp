# Procurement Queue

**Created:** 2026-05-12
**Policy:** Procurement (hardware, licenses, services) is a parallel track — never blocks code. Default mitigation = emulators / OSS substitutes.

## Items in procurement

| Item | Quantity | Status | Mitigation while pending |
|------|----------|--------|--------------------------|
| samsung-xcover-pro-6 | TBD (target: 1 per operator role, ~5 pilot) | scheduled | Test on emulator Pixel 6 Android 13 + any available Android 11+ device. Flutter shell already targets `minSdkVersion = 30` (Android 11). |
| samsung-tab-active-3 | TBD (target: 1 per weighing station, ~2 pilot) | scheduled | Test on emulator Pixel Tablet (paysage). Weighing screen still developed against documented specs (D2-31, D2-82). |
| aws-account-pilot-region | 1 account, region af-south-1 + eu-west-3 | scheduled | Local Postgres + LocalStack for S3/Keycloak. OpenTofu modules already plan-validatable without real AWS credentials (`tofu validate` + `tofu test`). |
| s3-hse-attachments-bucket | 1 bucket per env (`gravel-<env>-hse-attachments-<region>`) | scheduled | OpenTofu module `infra/modules/s3-objectlock` ready to apply. Code uses `S3_HSE_BUCKET` env var; defaults to mock in tests. |
| keycloak-managed-instance | 1 self-hosted Keycloak 26 cluster | scheduled | Existing `infra/keycloak/realm-gravel-dev.json` already covers Phase 1. Phase 2 adds 7 roles via `infra/keycloak/realms/gravel/roles/phase-02.json` — import command documented inline. |
| ses-domain-verification | sandbox → production for HSE/alerts emails | scheduled | Phase 2 alerts module stubs SES call; alert row marked `channel_email_sent_at = NULL`; tests assert only that row exists, not delivery. |

## How items leave the queue

When procurement closes:
1. Update row status to `done — <YYYY-MM-DD>`
2. Add a link to procurement record / vendor contract
3. Open follow-up PR if config changes required (env vars, secrets rotation, capacity tuning)

---

*Plan 02-W0-P01 Task 1 — Wave 0 foundations*
