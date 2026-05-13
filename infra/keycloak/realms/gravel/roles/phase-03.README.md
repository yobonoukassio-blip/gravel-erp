# Phase 3 Keycloak Roles — Import Instructions

## Roles Defined

| Role | Domain | Scope |
|------|--------|-------|
| `TIR_OPERATOR` | Blast operations | Site |
| `TIR_SUPERVISOR` | Blast management | Site |
| `HR_MANAGER` | Human resources | Tenant |
| `SHIFT_SUPERVISOR` | Shift tracking | Site |
| `PROCESSING_OPERATOR` | Crusher + screening | Site |
| `SALES_MANAGER` | Sales + BL + invoices | Tenant |
| `FINANCE_OFFICER` | FX rates + invoice batch | Tenant |
| `MAINTENANCE_TECH` | Work orders + parts | Site |

## Import via kcadm.sh

```bash
# Prerequisites: Keycloak admin CLI configured, realm "gravel-dev" exists
# Export KC_ADMIN_CLI pointing to your kcadm.sh

KC_REALM="gravel-dev"

# Import all Phase 3 roles
for role in TIR_OPERATOR TIR_SUPERVISOR HR_MANAGER SHIFT_SUPERVISOR \
            PROCESSING_OPERATOR SALES_MANAGER FINANCE_OFFICER MAINTENANCE_TECH; do
  kcadm.sh create roles \
    -r "$KC_REALM" \
    -f - < <(jq --arg name "$role" '.[] | select(.name == $name)' phase-03.json)
done
```

## Or import the full file at once

```bash
kcadm.sh create roles -r "$KC_REALM" -f phase-03.json
```

> Note: `TIR_SUPERVISOR` is a composite role that includes `TIR_OPERATOR`.
> Keycloak composite role composition is set via the `composites` field — ensure
> `TIR_OPERATOR` is created first.

## Site-scoped roles

Roles marked "Site-scoped" must be assigned within a Keycloak group representing
the site (e.g., `/gravel-dev/sites/SITE_CI_01`). The `SiteScopeGuard` in NestJS
reads the `site_id` claim from the JWT groups membership.

## Tenant-scoped roles

Roles marked "Tenant-scoped" can be assigned at realm level to give the user access
across all sites within their tenant.
