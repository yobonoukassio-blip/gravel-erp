# Phase 2: Vertical Slice Production - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 02-vertical-slice-production
**Mode:** `--auto` — no interactive Q&A performed. Gray areas identified by Claude, options weighed, recommended defaults selected and logged.
**Areas analyzed:** Architecture & modularité, Foration, Extraction, Transport & pesage, Stockpile event-sourced, Carburant, HSE incidents & CAPA, Dashboards & alertes, Mobile UX, Web, Sécurité/RBAC, Co-design opérateurs, Pont-bascule.

---

## Architecture & bounded contexts

| Option | Description | Selected |
|--------|-------------|----------|
| 7 modules NestJS dans le monolithe modulaire, intégration via EventEmitter2 in-process | Reste cohérent avec Phase 1 (modular monolith), pas de bus externe, strangler-ready | ✓ |
| Microservices dès Phase 2 (foration / production / hse séparés) | Charge ops disproportionnée pour 1 site pilote ; non recommandé par Phase 1 SUMMARY.md | |
| Kafka/Redpanda dès Phase 2 | Reporté Phase 5 (décision Phase 1 D-?? bus différé) | |

**Auto-selected:** EventEmitter2 in-process + outbox pattern pour Stockpile inflows.
**Rationale:** Aligne avec D-45 (modular monolith) et évite l'over-engineering avant que la charge ne le justifie.

---

## Foration — capture trou

| Option | Description | Selected |
|--------|-------------|----------|
| Append-only par trou, correction via événement `CORRECTED` | Aligne D-11 a + chain-of-hash spirituellement ; pas d'édition | ✓ |
| Update-in-place avec audit log | Plus simple pour l'opérateur mais expose à manipulation post-fact ; risque réglementaire | |
| Snapshot quotidien | Perte de granularité ; rejected | |

**Auto-selected:** Append-only + événement de correction. Confirmation explicite à la saisie ("non modifiable").
**Hors-tolérance** : permettre saisie avec raison libre (l'opérateur a toujours raison sur le terrain).

---

## Pesage & ticket transport

| Option | Description | Selected |
|--------|-------------|----------|
| Saisie manuelle pont-bascule + ticket numérique signé (content-hash) | Phase 2 ne tente pas RS232/Modbus (research flag roadmap reporté Phase 5) | ✓ |
| Intégration RS232/Modbus Phase 2 | Hardware variability + protocoles propriétaires ; recherche profonde différée | |
| Photo balance comme preuve (sans saisie) | Insuffisant pour audit + valuation stockpile | |

**Auto-selected:** Saisie manuelle + format `<SITE>-<YYYYMMDD>-<DEVICE>-<SEQ>` offline-safe + content-hash + signatures optionnelles (BL ventes Phase 3).

---

## Stockpile event model

| Option | Description | Selected |
|--------|-------------|----------|
| Event-sourced append-only avec projection matérialisée + chain-of-hash | Aligne STK-01 ; recompute nightly détecte dérive | ✓ |
| Snapshot quotidien + ajustements | Simple mais perd l'audit append-only requis | |
| CQRS lourd avec event store dédié (EventStoreDB) | Over-engineering Phase 2 ; Postgres event table suffit | |

**Auto-selected:** Postgres event table partitionnée mensuel + projection `stockpile_balance` + recompute nightly. Valorisation moyenne pondérée Phase 2 = carburant alloué uniquement, `cost_model_version=1`, étiqueté "provisoire". Version 2 (incluant main-d'œuvre + amortissement) en Phase 4.

---

## Carburant — modèle cuve & ravitaillement

| Option | Description | Selected |
|--------|-------------|----------|
| Symétrique stockpile (event-sourced + chain-of-hash + recon nightly) | Cohérence d'architecture, audit-grade | ✓ |
| Solde simple + audit log | Insuffisant pour CAR-01 explicitement event-sourced | |

**Anomalie L/h** : rolling 7j vs médiane 30j, seuils 1.5× / 0.4× configurables par site.

---

## HSE — incident + CAPA

| Option | Description | Selected |
|--------|-------------|----------|
| Incident append-only avec chain-of-hash + photos content-addressed S3 Object Lock Governance 7 ans + CAPA workflow | Aligne HSE-01..02 + critère succès #4 Phase 2 | ✓ |
| Object Lock Compliance mode | Trop strict Phase 2 (Governance permet override root) ; revisit Phase 6 pen-test | |
| Stockage local sans Object Lock | Rejette : risque manipulation incidents | |

**Sévérité 1-5** : échelle DSI par défaut, validation HSE officer pilote requise (flag pour kick-off Phase 2).
**Bloquant `severity ≥ 4`** : impossible de clore incident si CAPA non `verified`.

---

## Dashboards — personas & push real-time

| Option | Description | Selected |
|--------|-------------|----------|
| 2 personas Phase 2 (Directeur Site + Chef Carrière), SSE one-way + polling fallback | Aligne DSH-01 scope minimum, pas de WebSocket coût ops | ✓ |
| 6 personas dès Phase 2 | Direction Groupe/Finance/Maintenance/HSE complets requièrent données Phase 3/4 ; pas implémentable | |
| WebSocket bidirectionnel | Sticky-session pain K8s sans bénéfice clair Phase 2 (pas d'interaction temps réel client→serveur) | |

---

## Alertes — canaux Phase 2

| Option | Description | Selected |
|--------|-------------|----------|
| In-app (badge + drawer) obligatoire + email best-effort SES | Couvre DSH-06 sans dépendre SMS multi-provider (reporté Phase 6) | ✓ |
| SMS Phase 2 (Twilio direct) | Décision Phase 1 explicite : SMS multi-provider Phase 6 | |
| Email only | Insuffisant pour incidents critiques HSE temps réel | |

---

## Mobile — co-design opérateurs

| Option | Description | Selected |
|--------|-------------|----------|
| Session co-design 2 jours AVANT production code mobile métier, wireframes validés livrable Phase 2 | Honore research flag roadmap Phase 2 + réduit risque rejet terrain | ✓ |
| Skip co-design, livrer puis itérer | Risque réécriture totale + perte confiance utilisateurs ; rejeté | |
| Co-design reporté Phase 3 | Mais Phase 2 livre déjà tous les écrans mobile critiques ; trop tard | |

**Conséquence planning** : "Wave 0 co-design + wireframes" précède toute prod code mobile Phase 2.

---

## Mobile — device matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Samsung Galaxy XCover Pro 6 (phone rugged) + Galaxy Tab Active 3 (tablette rugged 8" pesage) | Cible commerciale réaliste + écosystème Samsung West Africa solide | ✓ |
| BYOD générique Android | Tests trop variables ; rejeté pour Phase 2 pilote | |
| Cat S62 Pro / autres rugged | Distribution Afrique de l'Ouest plus faible ; reporté backlog si demande client | |

---

## Coût/tonne — guardrail Phase 2 vs Phase 4

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 livre `cost_per_ton_provisional` (carburant seul) étiqueté "provisoire" UI | Permet validation plomberie sans usurper Finance | ✓ |
| Phase 2 livre coût/tonne final | Nécessite main-d'œuvre + amortissement (Phase 3 RH + Phase 4 finance) ; pas faisable | |
| Phase 2 ne livre rien | Perd la validation du pipeline KPI bout-en-bout ; rejeté | |

---

## Claude's Discretion (areas not framed as gray)

Areas où le planner ou l'agent d'exécution a latitude :
- Schéma exact migrations TypeORM
- Découpage exact composants Angular
- Structure Riverpod Flutter
- Choix bibliothèques signature / compression photo
- Stratégie seeding démo Phase 2

## Deferred Ideas (raised during analysis, scoped out)

- Intégration matérielle pont-bascule → Phase 5
- Dispatching automatique camions → backlog
- Habilitations & EPI complets → Phase 3 RH
- Audit sécurité périodique → Phase 3
- TF consolidé groupe → Phase 4
- Re-valorisation stockpile rétroactive → Phase 4
- WebSocket bidirectionnel dashboard → Phase 4+
- SMS notifications → Phase 6
- iOS native → Phase 6
- Object Lock Compliance mode → Phase 6 pen-test

---

*Discussion log generated by `/gsd:discuss-phase 2 --auto` on 2026-05-12.*
*No interactive Q&A. All decisions auto-resolved from Phase 1 baseline + research artifacts + roadmap research flags.*
