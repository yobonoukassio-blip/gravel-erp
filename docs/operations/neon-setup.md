# Setup Neon + Upstash (sans droits admin)

## 1. Trouver ta DATABASE_URL Neon

1. Ouvre [console.neon.tech](https://console.neon.tech)
2. Clique sur le projet **"Gravel"**
3. Bouton **"Connect"** en haut à droite
4. Onglet **"Node.js"** → copie la ligne `DATABASE_URL=postgresql://...`

La mettre dans `apps/api/.env` à la place de `REMPLACE_MOI`.

## 2. Trouver ton REDIS_URL Upstash

1. Ouvre [console.upstash.com](https://console.upstash.com)
2. Clique sur la base **"Gravel"**
3. Section **"Connect"** → onglet **"Node.js"**
4. Copie la ligne `REDIS_URL=rediss://default:TOKEN@selected-porpoise-122513.upstash.io:6379`

La mettre dans `apps/api/.env` à la place de `REMPLACE_MOI`.

## 3. Activer PostGIS sur Neon (obligatoire, une seule fois)

Dans le **SQL Editor** de Neon (menu gauche) :

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Cliquer **"Run"**. Vérifier que ça répond `CREATE EXTENSION`.

## 4. Lancer les migrations

```powershell
# Depuis la racine du projet
pnpm --filter=@gravel/api migration:run
```

> Si la commande n'existe pas encore, utiliser :
> `cd apps/api && npx typeorm migration:run -d src/data-source.ts`

## 5. Lancer l'API

```powershell
pnpm --filter=@gravel/api dev
```

L'API démarre sur http://localhost:3000

Tester : http://localhost:3000/health/live → doit répondre `{"status":"ok"}`

## 6. Lancer le web

```powershell
pnpm --filter=@gravel/web start
```

Ouvre http://localhost:4200

## Limites Neon free tier

| Fonctionnalité | Dispo |
|---|---|
| PostgreSQL 16 | ✓ |
| PostGIS | ✓ (`CREATE EXTENSION`) |
| TimescaleDB | ✗ (Phase 5 IoT — pas besoin Phase 2) |
| Connexions simultanées | 10 max (suffisant dev) |
| Stockage | 512 MB (suffisant Phase 2) |

## Si `pnpm --filter` ne fonctionne pas

```powershell
cd apps/api
copy .env.example .env   # si .env n'existe pas encore
pnpm dev
```
