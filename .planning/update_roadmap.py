import io
p = r"C:\Users\WILFRIED\OneDrive - Gravel Ivoire\Bureau\Projet Gravel\.planning\ROADMAP.md"
with io.open(p, "r", encoding="utf-8") as f:
    s = f.read()

old = """### Phase 1: Foundation
**Goal**: Les fondations multi-tenant load-bearing (identité, isolation, sync, master data, money, time) sont en place et testées, prêtes à porter chaque module métier sans rétrofit.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, FND-09, FND-10, FND-11
**Success Criteria** (what must be TRUE):
  1. Un administrateur tenant peut se connecter via Keycloak SSO (OIDC + MFA optionnelle) et créer un nouveau site avec timezone IANA, devise fonctionnelle, GPS et permis associés
  2. Un test cross-tenant en CI échoue immédiatement si un utilisateur du tenant A peut lire la moindre ligne du tenant B (RLS PostgreSQL appliqué sur chaque table)
  3. L'application mobile Android capture une donnée hors-ligne (journal d'activité quotidien), la persiste localement, puis la synchronise quand la connectivité revient — sans perte ni doublon
  4. Tout montant financier est stocké en bigint minor units avec sa devise (XOF=0 décimale, EUR=2) et un test DST-crossing sur OperationalDay passe en CI
  5. L'interface web et mobile basculent FR ↔ EN par utilisateur et chaque action utilisateur produit une entrée d'audit trail immuable (qui, quand, quoi, avant/après)
**Plans**: TBD"""

new = """### Phase 1: Foundation
**Goal**: Les fondations multi-tenant load-bearing (identité, isolation, sync, master data, money, time) sont en place et testées, prêtes à porter chaque module métier sans rétrofit.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06, FND-07, FND-08, FND-09, FND-10, FND-11
**Success Criteria** (what must be TRUE):
  1. Un administrateur tenant peut se connecter via Keycloak SSO (OIDC + MFA optionnelle) et créer un nouveau site avec timezone IANA, devise fonctionnelle, GPS et permis associés
  2. Un test cross-tenant en CI échoue immédiatement si un utilisateur du tenant A peut lire la moindre ligne du tenant B (RLS PostgreSQL appliqué sur chaque table)
  3. L'application mobile Android capture une donnée hors-ligne (journal d'activité quotidien), la persiste localement, puis la synchronise quand la connectivité revient — sans perte ni doublon
  4. Tout montant financier est stocké en bigint minor units avec sa devise (XOF=0 décimale, EUR=2) et un test DST-crossing sur OperationalDay passe en CI
  5. L'interface web et mobile basculent FR ↔ EN par utilisateur et chaque action utilisateur produit une entrée d'audit trail immuable (qui, quand, quoi, avant/après)
**Plans:** 6 plans across 3 waves
  - [ ] 01-W0-P01-PLAN.md (Wave 0) — Monorepo bootstrap, OpenTofu base infra, GitHub Actions CI 4-tier, Wave-0 test stubs covering FND-01..11
  - [ ] 01-W1-P02-PLAN.md (Wave 1) — Data platform: RLS isolation, audit chain-of-hash, money helpers, OperationalDay + DST test (FND-02, FND-06, FND-07, FND-08)
  - [ ] 01-W1-P03-PLAN.md (Wave 1) — Sync framework + mobile shell + journal d'activité round-trip + chaos harness (FND-10, FND-11)
  - [ ] 01-W1-P04-PLAN.md (Wave 1) — Keycloak 26 realm-as-code + NestJS JWT/CLS guards + web/mobile auth + i18n FR/EN (FND-01, FND-03, FND-09)
  - [ ] 01-W2-P05-PLAN.md (Wave 2) — Master Data CRUD UI: Site/Zone/Bench/Permit + activity-log read-only (FND-04, FND-05)
  - [ ] 01-W2-P06-PLAN.md (Wave 2) — OTel + Grafana LGTM + CI gates BLOCKING + 5 ADRs (cross-cutting close-out)"""

if old not in s:
    raise SystemExit("anchor not found")
s = s.replace(old, new)
s = s.replace("| 1. Foundation | 0/0 | Not started | - |", "| 1. Foundation | 0/6 | Planned | - |")

with io.open(p, "w", encoding="utf-8") as f:
    f.write(s)
print("ok")
