# Notification Delivery — Production Activation Checklist

Phase 9 a livré toute la plomberie (BullMQ + Brevo + Twilio + badge in-app)
en mode dry-run (`NTF_DRY_RUN=true`). Ce document décrit les étapes
strictement opérationnelles pour passer en prod : provisionnement comptes,
ajout des secrets, basculement du flag, validation bout-en-bout.

Estimation : 60-90 min si tous les comptes sont créés en amont.

---

## 1. Provisionner Brevo (email)

1. Créer un compte sur https://app.brevo.com (free tier : 300 emails/jour).
2. **Vérifier le domaine d'envoi** :
   - Settings → Senders & IP → Domains → Add a domain
   - Domaine : `gravel-ivoire.app` (ou domaine validé par le client)
   - Ajouter les enregistrements DNS SPF + DKIM affichés par Brevo
   - Attendre la propagation (~5-15 min)
3. **Créer une clé API** :
   - Settings → API keys → Create a new API key
   - Nom : `gravel-prod-email`
   - Scope : `Transactional emails` uniquement (pas SMS, pas Marketing)
   - Copier la clé `xkeysib-...` — on ne pourra plus la voir après.
4. **Créer un sender** :
   - Senders → Add a sender
   - Email : `alerts@gravel-ivoire.app`
   - Name : `Gravel Ivoire`

Coût mensuel attendu : 0 € jusqu'à 300 email/jour (suffisant pour POC),
puis ~20 €/mois pour 20k emails/mois (plan Starter).

---

## 2. Provisionner Twilio (SMS)

1. Créer un compte sur https://www.twilio.com (trial : 15 $ de crédit).
2. **Acheter un numéro long-code** :
   - Phone Numbers → Buy a number
   - Country : Côte d'Ivoire (CI) — si dispo. Sinon France (FR) ou US.
   - Capabilities : SMS uniquement
   - Coût : ~1 $/mois + ~0.05 $/SMS vers CI.
3. **Récupérer les credentials** :
   - Account → API keys & tokens
   - `TWILIO_ACCOUNT_SID` (AC...)
   - `TWILIO_AUTH_TOKEN` (cliquer "View" puis copier)
4. **Vérifier les numéros destinataires** (compte trial uniquement) :
   - Phone Numbers → Verified caller IDs → Add a new caller ID
   - Ajouter chaque numéro qui doit recevoir un SMS de test
   - (En compte payant, plus de restriction — tous les numéros marchent.)

Coût mensuel attendu : ~30-60 €/mois pour 500-1000 SMS critiques + numéro.

---

## 3. Ajouter les secrets côté Railway

Dans le dashboard Railway → projet API → Variables :

```bash
# Brevo (email)
BREVO_API_KEY=xkeysib-<la-clé-copiée-en-§1.3>
BREVO_SENDER_EMAIL=alerts@gravel-ivoire.app
BREVO_SENDER_NAME=Gravel Ivoire

# Twilio (SMS)
TWILIO_ACCOUNT_SID=AC<sid-copié-en-§2.3>
TWILIO_AUTH_TOKEN=<token-copié-en-§2.3>
TWILIO_FROM_NUMBER=+225<numéro-acheté-en-§2.2>

# Bascule notification : passer de dry-run à envoi réel
NTF_DRY_RUN=false
```

**ATTENTION** : ne PAS basculer `NTF_DRY_RUN=false` AVANT que les 6 variables
ci-dessus soient toutes set. Sans clé API, le provider retourne
`skipped/provider_not_configured` — c'est OK. Sans dry-run ET sans clé,
le worker logue une erreur à chaque job.

---

## 4. Valider en staging d'abord

Si possible, dupliquer un projet Railway staging avec les mêmes secrets et
tester là-bas en premier :

```bash
# Déclencher un événement de test depuis l'API
curl -X POST https://gravel-api-staging.railway.app/api/test/fire-alert \
  -H "Authorization: Bearer <token-admin>" \
  -d '{"event_type":"production.stockpile.threshold_crossed","severity":"critical"}'
```

Vérifier en parallèle :
1. **Brevo dashboard** → Transactional → Statistics : `1 email sent`
2. **Twilio Console** → Monitor → Logs → Messaging : `1 SMS delivered`
3. **Boîte de réception du destinataire de test** : email arrivé
4. **Téléphone du destinataire de test** : SMS arrivé

---

## 5. Activer en production

Une fois la validation staging OK :
1. Ajouter les mêmes variables sur Railway prod.
2. Garder `NTF_DRY_RUN=true` 24h pour vérifier qu'aucun ancien stub n'envoie.
3. Bascular `NTF_DRY_RUN=false`.
4. Surveiller pendant 1h les logs Railway pour repérer :
   - `Brevo non-retryable error` → email rejeté par le destinataire (bad address)
   - `Twilio non-retryable error code=21211` → numéro invalide
   - `rate_limited` → limite 3/h/destinataire atteinte (attendu)

---

## 6. Surveillance continue

- **Dashboard Brevo** : taux de délivrabilité doit rester > 95%
- **Dashboard Twilio** : taux de livraison SMS > 90%
- **BullMQ dead-letter queue** : surveiller `failed` job count via Bull Board
  (à exposer en route admin protégée si besoin)
- **Coût Twilio** : alerte si > 100 €/mois inattendu

---

## 7. Rollback rapide

Si une vague d'emails/SMS part par erreur :

```bash
# Sur Railway : set NTF_DRY_RUN=true → redémarre le service
# Toutes les nouvelles jobs sont alors marquées skipped/dry_run.
# Les jobs déjà enfilées dans BullMQ sont elles aussi neutralisées
# (le worker re-lit le flag à chaque process).
```

Pour purger les jobs en file :
```bash
# Connexion Upstash Redis console → DEL bull:notifications:wait
# (Attention : supprime aussi les jobs légitimes en attente.)
```

---

## Liens

- Code BullMQ : `apps/api/src/modules/notification/notification.module.ts`
- Provider Brevo : `apps/api/src/modules/notification/providers/email-brevo.provider.ts`
- Provider Twilio : `apps/api/src/modules/notification/providers/sms-twilio.provider.ts`
- Dispatcher : `apps/api/src/modules/analytics/services/alert-dispatcher.service.ts`
- Badge in-app : `apps/web/src/app/layout/notification-badge.component.ts`
