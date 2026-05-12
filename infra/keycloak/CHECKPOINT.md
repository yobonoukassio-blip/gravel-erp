# Keycloak Deployment Checkpoint (W2-P04 T02)

This document describes the single human verification step required after Helm-deploying
Keycloak 26 with the auto-imported `gravel-dev` realm. The realm itself, the 7 roles,
the 3 clients, the 2 groups, the 5 dev users, and all token mappers are managed
declaratively via `realm-gravel-dev.json` + `keycloak-config-cli` — no UI clicks needed.

## What the automation does

`helm upgrade --install keycloak infra/helm/keycloak -n auth --create-namespace`

1. Creates a `keycloak-admin` Secret with a random admin password (Bitnami chart default).
2. Boots Keycloak 26 with `KC_HOSTNAME_STRICT=true` (Pitfall 4 mitigation).
3. Runs the `keycloak-config-cli` Job which imports `realm-gravel-dev.json`.
4. Subsequent upgrades re-apply the JSON idempotently.

## Local-only autonomous bootstrap (used by this plan in --auto mode)

If you do NOT have a running Kubernetes cluster, you can bootstrap Keycloak locally
in autonomous mode without human interaction:

```bash
# Linux/macOS — generate a random admin password
mkdir -p infra/keycloak/.gitignored-bootstrap-secrets
openssl rand -base64 24 > infra/keycloak/.gitignored-bootstrap-secrets/admin.txt

# Windows PowerShell equivalent
$pw = [Convert]::ToBase64String((1..18 | %{Get-Random -Maximum 256}))
$pw | Out-File -Encoding ASCII infra/keycloak/.gitignored-bootstrap-secrets/admin.txt

# Run Keycloak in docker:
docker run -d --name keycloak-dev -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=$(cat infra/keycloak/.gitignored-bootstrap-secrets/admin.txt) \
  quay.io/keycloak/keycloak:26.0 start-dev

# Import the realm:
docker run --rm --network host \
  -v $PWD/infra/keycloak:/config \
  -e KEYCLOAK_URL=http://localhost:8080 \
  -e KEYCLOAK_USER=admin \
  -e KEYCLOAK_PASSWORD=$(cat infra/keycloak/.gitignored-bootstrap-secrets/admin.txt) \
  -e IMPORT_FILES_LOCATIONS=/config/realm-gravel-dev.json \
  adorsys/keycloak-config-cli:v6.1.0-26.0.0
```

The `.gitignored-bootstrap-secrets/` directory is excluded from version control via
`infra/keycloak/.gitignored-bootstrap-secrets/.gitignore`.

## Human verification (production / staging deploys)

1. Retrieve the admin password:
   `kubectl -n auth get secret keycloak-admin -o jsonpath='{.data.admin-password}' | base64 -d`
2. Port-forward (or visit ingress): `kubectl -n auth port-forward svc/keycloak-http 8080:8080`
3. Open `http://localhost:8080/admin` → log in as `admin`.
4. Confirm:
   - Realm dropdown shows `gravel-dev`.
   - **Realm roles** tab lists exactly 7 entries: DIRECTION_GROUPE, DIRECTEUR_SITE,
     CHEF_CARRIERE, MAINTENANCE, HSE, FINANCE, OPERATEUR_TERRAIN.
   - **Groups** tab shows `tenant-dev` with two subgroups
     (`site-ci-abidjan`, `site-ci-yamoussoukro`).
   - **Clients** tab lists `gravel-api`, `gravel-web`, `gravel-mobile`.
   - **Users** tab shows the 5 dev users.
5. (Optional) Trigger a TOTP setup flow by logging in as `direction.groupe` —
   conditional flow `conditional-otp-by-role` prompts for OTP because the role is
   in the allow-list `DIRECTION_GROUPE,FINANCE`.

## Resume signal

Type **`approved`** in the chat once the realm is visible and one dev user can log
in via the Keycloak login page.

## Rollback

`helm rollback keycloak <previous-revision> -n auth`. The realm JSON is versioned in
git; rolling back the chart rolls back the realm config to the prior commit.
