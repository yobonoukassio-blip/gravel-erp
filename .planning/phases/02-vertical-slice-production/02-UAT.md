---
status: partial
phase: 02-vertical-slice-production
source:
  - 02-W0-P01-SUMMARY.md
  - 02-W1-P02-SUMMARY.md
  - 02-W1-P03-SUMMARY.md
  - 02-W2-P04-SUMMARY.md
  - 02-W2-P05-SUMMARY.md
  - 02-W3-P06-SUMMARY.md
  - 02-W3-P07-SUMMARY.md
  - 02-W3-P08-SUMMARY.md
started: "2026-05-13T00:00:00.000Z"
updated: "2026-05-13T00:00:00.000Z"
---

## Current Test

[partial — tous les tests bloqués par absence d'environnement local (pas d'accès admin Docker).
Validation assurée par CI GitHub Actions (lint + build + gate). Reprendre avec Neon+pnpm ou Codespaces.]

## Tests

### 1. Cold Start Smoke Test
expected: |
  Arrête tout processus en cours. Lance `docker compose up -d` (Postgres + Redis + Keycloak).
  Puis `pnpm --filter @gravel/api dev`. Le serveur NestJS démarre sans erreur,
  les migrations s'appliquent, et GET /api/health retourne `{"status":"ok"}`.
result: blocked
blocked_by: docker-admin
reason: "Pas d'accès administrateur sur la machine — impossible d'installer Docker Desktop."

### 2. Saisie trou foré mobile (offline)
expected: |
  Sur l'app mobile, ouvre le module Foration. Tape sur "Nouveau trou foré" sans connexion réseau.
  Le formulaire s'affiche avec : identifiant, profondeur (m), diamètre (mm), sélecteur d'opérateur,
  sélecteur de machine, et un indicateur GPS. Remplis et soumets. Le trou apparaît dans la liste
  locale même sans sync. Une fois la connexion rétablie, il se synchronise avec l'API.
result: [pending]

### 3. Rendement foration (m/h) — web
expected: |
  Sur le web, ouvre `/foration`. Sélectionne un plan de forage avec des trous saisis.
  La colonne "Rendement m/h" affiche une valeur calculée (profondeur totale / durée session).
  Si aucun trou n'est encore saisi, la colonne affiche "—" ou 0.
result: [pending]

### 4. Cycle d'extraction mobile (offline)
expected: |
  Sur mobile, ouvre le module Extraction. Crée un nouveau cycle : sélectionne l'engin,
  la zone, le type de matériau, la tonnage estimée. Soumets sans réseau. Le cycle
  apparaît dans la liste locale avec statut "pending_sync". Après sync, visible sur le web `/extraction`.
result: [pending]

### 5. Ticket de pesée offline + signature
expected: |
  Sur mobile, ouvre Transport → Nouveau ticket. Saisis le camion, le tonnage brut/tare,
  la destination. Signe sur le pad de signature. Soumets sans réseau.
  Le ticket reçoit un numéro généré offline (format: SITE-DATE-SEQ).
  Après sync, le ticket est visible sur `/transport/tickets` avec le hash SHA-256 de contenu.
result: [pending]

### 6. Tableau de dispatch camions — web
expected: |
  Sur le web, ouvre `/transport/dispatch`. Le tableau affiche les rotations en cours
  groupées par statut (pending / in-transit / done). Tu peux créer une nouvelle rotation
  depuis le board. Les colonnes incluent : camion, chauffeur, banc, zone, tonnage, heure.
result: [pending]

### 7. Ledger stockpile append-only + intégrité chain-of-hash
expected: |
  Sur le web, ouvre `/stockpile/events`. Ajoute un événement STOCKPILE_INFLOW
  via `/stockpile/adjustment`. Le nouvel événement apparaît dans la liste avec
  un `chain_hash` visible (16 premiers caractères). Tenter un DELETE ou PATCH
  sur l'événement via l'API retourne HTTP 405 Method Not Allowed.
result: [pending]

### 8. Alerte de seuil stockpile
expected: |
  Dans `/stockpile/thresholds`, vérifie qu'un seuil minimal existe (ex: granite_brut ≥ 1000t).
  Dans `/stockpile/adjustment`, saisis un événement STOCKPILE_OUTFLOW_SALE qui passe
  en-dessous du seuil. Une alerte apparaît dans `/alerts-inbox` avec le type
  `threshold_crossed` et le stockpile concerné.
result: [pending]

### 9. Formulaire d'ajustement stockpile (photo SHA-256 obligatoire)
expected: |
  Sur le web, ouvre `/stockpile/adjustment`. Essaie de soumettre sans photo.
  Le bouton "Soumettre" reste désactivé. Attache une photo — le champ affiche
  les 16 premiers caractères du SHA-256 calculé côté client. Soumets avec raison
  et photo : l'événement STOCKPILE_ADJUSTMENT est créé correctement.
result: [pending]

### 10. Refuel carburant mobile (offline)
expected: |
  Sur mobile, ouvre Carburant → Refuel. Sélectionne l'engin, le litrages dispensé,
  le tank source. Soumets sans réseau. Après sync, l'événement apparaît sur le web
  `/fuel/refuel-list`. Le solde du tank source est réduit en conséquence.
result: [pending]

### 11. Création incident HSE immuable
expected: |
  Sur mobile, ouvre HSE → Nouvel incident. Remplis : catégorie, sévérité (1-5),
  description, heure, coordonnées GPS, photo. Soumets. L'incident est créé avec
  un `row_hash` visible. Tenter de modifier ou supprimer l'incident via l'API
  retourne HTTP 405. Sur le web `/hse`, l'incident apparaît dans la liste.
result: [pending]

### 12. Workflow CAPA — incident sévérité 5 bloqué
expected: |
  Crée un incident de sévérité 5. Tente de le clôturer immédiatement.
  L'API retourne une erreur `ERR_CAPA_NOT_VERIFIED` — la clôture est bloquée
  tant que des CAPA associées ne sont pas vérifiées. Crée 2 CAPA, marque-les
  "verified". L'incident peut maintenant passer en "closed".
result: [pending]

### 13. KPI TF (Taux de Fréquence) — dashboard HSE
expected: |
  Sur le web `/hse`, une section KPI affiche le Taux de Fréquence (TF) calculé
  (accidents avec arrêt × 1 000 000 / heures travaillées). En mode `rolling_12m`,
  le calcul porte sur les 12 derniers mois. Si aucun accident avec arrêt : TF = 0.
result: [pending]

### 14. Dashboard site — SSE temps réel avec label "Provisoire"
expected: |
  Sur le web, ouvre `/dashboard`. Le tableau de bord Directeur Site affiche :
  tonnage extrait du jour, rotations, incidents HSE ouverts, et coût/tonne.
  La tuile coût/tonne porte OBLIGATOIREMENT un badge ambre "Provisoire" visible
  (jamais un chiffre nu sans ce label). Les KPIs se mettent à jour en temps réel
  via SSE sans rechargement de page.
result: [pending]

### 15. Alertes inbox — badge + acquittement
expected: |
  Sur le web, le header de l'application affiche un badge numérique sur l'icône
  d'alertes (se met à jour en temps réel via SSE). Ouvre `/alerts-inbox`.
  Les alertes sont listées avec sévérité colorée. Tu peux acquitter (Ack) ou
  résoudre (Resolve) une alerte — le badge se décrémente aussitôt.
result: [pending]

## Summary

total: 15
passed: 0
issues: 0
pending: 0
skipped: 0
blocked: 15
blocked_reason: "No local admin access — Docker Desktop cannot be installed. CI pipeline (GitHub Actions lint+build+gate) is the validation substitute. Resume UAT with Neon+pnpm or GitHub Codespaces."

## Gaps

[none yet]
