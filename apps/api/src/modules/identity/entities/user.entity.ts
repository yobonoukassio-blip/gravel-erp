import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { GravelRole } from '@gravel/shared-types';

/**
 * `users` row.
 * id == Keycloak `sub`. All access RLS-scoped on tenant_id (D-07 layer 1).
 */
@Entity({ name: 'users' })
@Index('users_keycloak_sub_idx', ['keycloakSub'])
export class User {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'keycloak_sub', type: 'text', unique: true })
  keycloakSub!: string;

  @Column({ type: 'citext' })
  email!: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @Column({ type: 'text' })
  role!: GravelRole;

  @Column({ name: 'group_scope', type: 'text', nullable: true })
  groupScope!: 'group' | null;

  @Column({ name: 'site_ids', type: 'uuid', array: true, default: () => "'{}'" })
  siteIds!: string[];

  @Column({ name: 'preferred_locale', type: 'char', length: 5, default: 'fr-CI' })
  preferredLocale!: string;

  @Column({ name: 'mfa_enabled', type: 'boolean', default: false })
  mfaEnabled!: boolean;

  @Column({ name: 'password_hash', type: 'text', nullable: true, select: false })
  passwordHash!: string | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
