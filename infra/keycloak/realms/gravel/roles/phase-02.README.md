# Phase 2 Keycloak Roles — Import Guide

7 roles defined in `phase-02.json` (D2-110, D2-111).

## Import via `kcadm.sh` (CLI)

```bash
# Authenticate (one-time per session)
kcadm.sh config credentials \
  --server https://keycloak.gravel-ivoire.example.com \
  --realm master \
  --user admin

# Create each role from the JSON array
jq -c '.[]' infra/keycloak/realms/gravel/roles/phase-02.json | while read -r role; do
  kcadm.sh create roles -r gravel -b "$role"
done
```

## Import via `terraform-provider-keycloak` (preferred — GitOps)

```hcl
locals {
  phase_02_roles = jsondecode(file("${path.module}/roles/phase-02.json"))
}

resource "keycloak_role" "phase_02" {
  for_each    = { for r in local.phase_02_roles : r.name => r }
  realm_id    = keycloak_realm.gravel.id
  name        = each.value.name
  description = each.value.description
}
```

## Site scoping

Roles are global within the realm. **Site scoping is enforced via Keycloak
groups** (Phase 1 pattern, ADR-0005): a user is a member of group
`site:<site_id>` and the API's `SiteScopeGuard` (Phase 1) intersects the
JWT's `groups` claim with the requested resource's `site_id`.

## Verification

```bash
kcadm.sh get roles -r gravel | jq '.[] | select(.name | startswith("OPERATOR_") or startswith("TRUCK_") or startswith("WEIGHING_") or startswith("HSE_") or startswith("SITE_") or startswith("QUARRY_")) | .name'
# Expected: 7 lines covering all phase-02 roles
```
