# Roadmap: Gravel Ivoire — ERP Carriere de Granite

**Current version:** v1.0 shipped
**Next milestone:** v1.1 (not yet defined)

## Core Value

Donner a un groupe minier une visibilite temps reel consolidee sur la production, les couts a la tonne et la securite de chaque site/pays, avec saisie terrain mobile fiable meme en mode offline.

## Shipped Milestones

- **v1.0** (2026-05-12 → 2026-05-16) — Foundation + Production vertical slice + Operational completeness + Finance backend + IoT ingestion model. 5 phases, 23 plans, 237 commits, 107k LOC. [Full archive](milestones/v1.0-ROADMAP.md)

## Upcoming

### Phase 6: Hardening, Scale & Multi-Country Rollout (v2)
**Goal**: Le systeme est pret a scaler du premier pays production-tested vers un second pays/site, avec pen-test, drills, et capacites multi-region.
**Requirements**: HRD-01..08, EXP-01..04, SST-01..02 (v2 only)
**Plans**: TBD

## Known Tech Debt (from v1.0 audit, deferred to v1.1)

| ID | Gap | Effort | Priority |
|---|---|---|---|
| FND-07 | Money 3-representation ledger (amount_original / site_functional / group) | 1-2d | P2 |
| MNT-02 | Preventive maintenance @Cron scheduler | 3h | P2 |
| MNT-04 | spare_part.threshold_crossed alert handler | 2h | P2 |
| Phase 4 | 4/7 cost components hardcoded to 0n, alert_rule not seeded, email/SMS stubs | 1-2d | P2 |
| i18n AR | Arabic locale absent from web + mobile (backend ready) | 4h | P3 |
| IOT-01/02/03 | MQTT broker + edge gateway + Teltonika adapter (backend only today) | 2-3w | DEFER v2 |
| DSH-05 | Dashboard groupe consolidé (Finance group-level) | 1d | P2 |
| Mobile | Maintenance + Ventes screens are 19-line placeholder shells | 2d | P2 |

---
*Roadmap created: 2026-05-12*
*v1.0 archived: 2026-05-16*
