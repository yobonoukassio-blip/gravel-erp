# Phase 2 — Provisional Mobile Wireframes

**Status:** Provisional — derived directly from `02-CONTEXT.md` fields
**Decision basis:** D2-11, D2-20, D2-30, D2-31, D2-51, D2-60, D2-81 (UX terrain ergonomics)
**Co-design:** Tracked as **non-blocking parallel track** (see `docs/operations/parallel-tracks.md`). User decision 2026-05-12: prérequis humains = pistes parallèles, jamais bloquants.

> Note: provisional wireframes — to be refined by parallel co-design track (see docs/operations/parallel-tracks.md). Code will be tagged `// TODO(co-design): valider en atelier`.

## Common UX constraints (D2-81)

- Cible boutons primaires: **56 dp minimum** (utilisation avec gants)
- Contraste haut : luminosité plein soleil (test cible : XCover Pro 6 mode boost lumière)
- Confirmations explicites append-only : "Une fois envoyé, non modifiable. Confirmer."
- Indicateur précision GPS : **vert ≤ 10 m**, **ambre 10–30 m**, **rouge > 30 m**
- Photos compressées automatiquement avant upload (max 2 Mo, 1920 px côté long)
- Toute navigation accessible offline depuis cache local (aucun écran réseau-only)

---

## Foration — Saisie d'un trou foré

Source: D2-11 (DrilledHole — `append_only_event`)

```
┌──────────────────────────────────────────┐
│  ← Foration · Trou #{hole_index}         │
├──────────────────────────────────────────┤
│  Plan: [DRILL-PLAN-2026-W19-B3]          │
│  Banc: B3 — Zone Nord                    │
│  ─────────────────────────────────────   │
│  📍 GPS  6.823°N, 5.241°W  ●vert 4.2m   │
│         [Recapturer GPS]                 │
│                                          │
│  Profondeur réelle (m)   [____.__]       │
│  Diamètre réel (mm)      [____]          │
│  Inclinaison (deg) [slider 0────90]      │
│                                          │
│  Démarré:   06:42 (Africa/Abidjan)       │
│  Terminé:   [● en cours] [Stop]          │
│                                          │
│  Carburant consommé (L)  [___] (opt.)    │
│  Notes:    [____________________]        │
│  📷 Photo  [Ajouter]   (SHA-256 stored)  │
│                                          │
│  // TODO(co-design): valider en atelier  │
│  Operational day: 2026-05-12 (auto)      │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │   ENREGISTRER (56dp button)        │  │
│  └────────────────────────────────────┘  │
│  ⚠ Append-only : non modifiable          │
└──────────────────────────────────────────┘
```

**Fields (D2-11):** plan_id, hole_index_in_plan (auto), gps_point + accuracy_m, actual_depth_m, actual_diameter_mm, inclination_deg, started_at_local + ended_at_local + iana_timezone, operational_day_id (auto), operator_id (JWT), machine_id (sélection), fuel_liters_consumed (opt), notes_text, photo_blob_sha256 (opt).

**Hors-tolérance guard (D2-12):** Si |actual_depth − target_depth| > 10 % ou |actual_diameter − target| > 5 % → bottom sheet "Écart de X % détecté — raison ?" (texte libre obligatoire). NE BLOQUE PAS la saisie.

---

## Extraction — Cycle d'extraction

Source: D2-20 (ExtractionCycle — `append_only_event`)

```
┌──────────────────────────────────────────┐
│  ← Extraction · Cycle                    │
├──────────────────────────────────────────┤
│  Banc: [▼ B3 — Zone Nord]                │
│  Engin:[▼ Pelle CAT-336 (EXC-04)]        │
│  Matériau: [○ Granite brut               │
│             ● Tout-venant                │
│             ○ Stérile]                   │
│                                          │
│  Tonnage estimé (t)   [_____.__]         │
│      ⓘ Estimé — tonnage faisant foi      │
│        = pesage transport (TRP-02)       │
│                                          │
│  Démarré:  07:15                         │
│  Terminé:  [● en cours]                  │
│                                          │
│  Temps d'arrêt (min) [__]                │
│  Raison: [○ Repas ○ Carburant            │
│           ○ Mécanique ○ Météo            │
│           ○ Sécurité ○ Autre]            │
│                                          │
│  Notes: [______________]                 │
│  // TODO(co-design): valider en atelier  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │   ENREGISTRER (56dp)               │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Fields (D2-20):** site_id (JWT), operational_day_id (auto), bench_id, equipment_id, operator_id, material_type ∈ {granite_brut, tout_venant, sterile}, estimated_tonnage_t (decimal 1), cycle_started/ended_at_local + iana_timezone, downtime_minutes (opt), downtime_reason_code (opt), notes.

---

## Truck Rotation — Création rotation camion

Source: D2-30 (TruckRotation — `append_only_event`)

```
┌──────────────────────────────────────────┐
│  ← Transport · Nouvelle rotation         │
├──────────────────────────────────────────┤
│  Camion: [▼ T-12 — Mercedes Actros]     │
│  Chauffeur: [▼ KOFFI Jean (auto)]       │
│                                          │
│  Banc origine (loaded_at_bench_id)       │
│    [▼ B3 — Zone Nord]                    │
│  Stockpile cible (unloaded_at_zone_id)   │
│    [▼ STK-02 Granite brut N]             │
│  Matériau: [▼ Granite brut]              │
│                                          │
│  Ticket de pesage:                       │
│    [+ Créer ticket de pesage]            │
│    (FK obligatoire — D2-30)              │
│                                          │
│  Chargé à: 08:02   Déchargé à: [—]      │
│  Cycle:    [calculé auto]                │
│                                          │
│  // TODO(co-design): valider en atelier  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │   CHARGER (56dp)                   │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │   DÉCHARGER (au stockpile)         │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**Fields (D2-30):** site_id, operational_day_id, truck_equipment_id, driver_id, loaded_at_bench_id, unloaded_at_zone_id, material_type, loaded_tonnage_t (decimal 2 — source = ticket pesée), weighing_ticket_id (FK NOT NULL), loaded_at_utc, unloaded_at_utc, cycle_time_minutes (dérivé).

**Lien stockpile (D2-35):** Rotation validée → événement `production.transport.rotation_completed` → matérialisation `STOCKPILE_INFLOW` via outbox (même tx).

---

## Weighing Ticket — Ticket pont-bascule

Source: D2-31, D2-32 (WeighingTicket — `append_only_event`, numérotation offline)

```
┌──────────────────────────────────────────────┐
│  ← Pesage · Ticket (orientation paysage)     │
│  Optimisé Galaxy Tab Active 3 — D2-82        │
├──────────────────────────────────────────────┤
│  N°: CIV01-20260512-MOB42-0007  (auto)       │
│       site-YYYYMMDD-device-seq               │
│                                              │
│  Station: [▼ PB-NORD]                        │
│  Camion: [▼ T-12]   Chauffeur: KOFFI J.      │
│  Matériau: [▼ Granite brut]                  │
│                                              │
│  Poids brut (kg)   [_____.__]                │
│  Poids tare (kg)   [_____.__]                │
│  Poids net (kg)    [calculé serveur]         │
│                                              │
│  Pesé à: 08:25  Africa/Abidjan               │
│                                              │
│  Signature chauffeur:  [✍ tap to sign]      │
│  Signature client:     [✍ tap to sign]      │
│      (Phase 2 = interne seulement — D2-31)   │
│                                              │
│  Notes: [___________]                        │
│  // TODO(co-design): valider en atelier      │
│  is_offline_generated = true                 │
│  content_hash = sha256(payload + signatures) │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │   ENREGISTRER (56dp button)          │    │
│  └──────────────────────────────────────┘    │
│  ⚠ Append-only après confirmation             │
└──────────────────────────────────────────────┘
```

**Fields (D2-31):** ticket_number (offline-generated D2-32), gross_kg, tare_kg, net_kg (server generated col = gross - tare), truck_equipment_id, driver_id, material_type, weighed_at_local + iana_timezone, operator_user_id (JWT), weighing_station_code, client_signature_blob_sha256 (opt — Phase 3 ventes), driver_signature_blob_sha256 (opt), notes, is_offline_generated, content_hash.

---

## Equipment Refuel — Ravitaillement engin

Source: D2-51 (EquipmentRefuel — `append_only_event`)

```
┌──────────────────────────────────────────┐
│  ← Carburant · Ravitaillement            │
├──────────────────────────────────────────┤
│  Cuve source: [▼ TANK-01 — gasoil 5000L]│
│  Engin:       [▼ EXC-04 — Pelle CAT-336]│
│  Opérateur:   [▼ DIOP M. (auto-fill)]   │
│                                          │
│  Litres délivrés      [____.__]          │
│  Compteur engin (h)   [______]           │
│      ⓘ delta vs dernier → conso L/h      │
│                                          │
│  📷 Photo de la jauge (recommandée)      │
│      [Ajouter] (content-addressed S3)    │
│                                          │
│  Heure: 12:14  Operational day: auto     │
│                                          │
│  Notes: [___________________]            │
│  // TODO(co-design): valider en atelier  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │   ENREGISTRER (56dp)               │  │
│  └────────────────────────────────────┘  │
│  ⚠ Génère FUEL_DISPENSE_OUT + ligne     │
│    EquipmentFuelConsumption (atomique)   │
└──────────────────────────────────────────┘
```

**Fields (D2-51):** tank_id, equipment_id, operator_id, liters, equipment_hour_meter_reading, gauge_photo_blob_sha256 (opt mais recommandé), operational_day_id, created_at_local + iana_timezone, notes.

**Atomicité:** à la sync, génère (1) `fuel_tank_event` `FUEL_DISPENSE_OUT`, (2) `EquipmentFuelConsumption` row — même tx via outbox D2-35.

**Alerte L/h (D2-52):** Rolling 7j vs médiane 30j ; > 1.5× ou < 0.4× → événement `production.fuel.anomaly_detected`.

---

## HSE Incident — Déclaration d'incident

Source: D2-60 (HseIncident — chain-of-hash D-28 obligatoire)

```
┌──────────────────────────────────────────┐
│  ← HSE · Nouvel incident                 │
├──────────────────────────────────────────┤
│  ⚠ Capture chronologique APPEND-ONLY     │
│    (chain-of-hash sécurisée)             │
│                                          │
│  Catégorie:                              │
│   [○ Accident personnel                  │
│    ● Accident matériel                   │
│    ○ Near-miss                           │
│    ○ Environnement                       │
│    ○ Sécurité                            │
│    ○ Autre]                              │
│                                          │
│  Sévérité (1–5) [slider 1●─2─3─4─5]     │
│      Légende: 1=mineur … 5=fatal         │
│      (Échelle CI à valider HSE — D2-60)  │
│                                          │
│  Lieu (texte): [_________________]       │
│  📍 GPS (opt.) [Capturer]                │
│                                          │
│  Survenu à: [date] [heure]               │
│      Africa/Abidjan                      │
│                                          │
│  Personnes impactées:                    │
│    [+ Ajouter] (employee, blessure,      │
│                 partie corps, lost time) │
│                                          │
│  Équipements impactés:                   │
│    [+ Sélection multiple]                │
│                                          │
│  Chronologie (markdown libre):           │
│    [_____________________________]       │
│    [_____________________________]       │
│      ⓘ Édition après création =          │
│        nouvel événement                  │
│        HSE_INCIDENT_CHRONOLOGY_APPENDED  │
│                                          │
│  📷 Pièces jointes (S3 Object Lock 7y)  │
│    [+ Ajouter]                           │
│                                          │
│  // TODO(co-design): valider en atelier  │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │   DÉCLARER INCIDENT (56dp)         │  │
│  └────────────────────────────────────┘  │
│  ⚠ Sévérité ≥4 : clôture bloquée tant    │
│    que CAPA non verified (D2-62)         │
└──────────────────────────────────────────┘
```

**Fields (D2-60):** site_id, occurred_at_local + iana_timezone, operational_day_id, category enum, severity 1–5, reporter_user_id (JWT), location_text, gps_point (opt), people_impacted JSONB, equipment_impacted_ids UUID[], chronology_md, prev_hash, row_hash, content_addressed_attachments TEXT[] (SHA-256 → S3 Object Lock Governance 7y per D2-61).

---

## Notes for co-design refinement (parallel track)

When the co-design workshop happens (parallel track, non-blocking), expected refinements:

1. Field grouping order on Foration screen (compass / GPS placement)
2. Material type taxonomy refinement (granite_brut vs tout_venant cutoff)
3. Downtime reason codes — current set is provisional
4. Severity scale legal calibration with HSE officer
5. Signature capture flow on Tab Active 3 in landscape — ergonomic touch zones
6. Photo capture gating — "no save without photo" toggles per screen

Generate PR adjustments after workshop. Do **not** rewrite — increment from this baseline.

---

*Last updated: 2026-05-12 — Plan 02-W0-P01 Task 1*
