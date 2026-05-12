import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Stockpile (D2-40) — a physical material pile at a zone of a site.
 *
 * Master-data style row. Mutable label/default_calibre via PATCH; soft-deletes
 * use an `archived_at_utc` per project conventions (not handled here for P05).
 */
@Entity({ name: 'stockpile' })
@Index('stockpile_tenant_site_idx', ['tenantId', 'siteId'])
@Index('stockpile_zone_idx', ['zoneId'])
@Index('stockpile_tenant_site_code_uq', ['tenantId', 'siteId', 'code'], {
  unique: true,
})
export class Stockpile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'uuid', name: 'zone_id' })
  zoneId!: string;

  @Column({ type: 'varchar', length: 50, name: 'code' })
  code!: string;

  @Column({ type: 'varchar', length: 200, name: 'label' })
  label!: string;

  @Column({ type: 'varchar', length: 50, name: 'default_calibre_code' })
  defaultCalibreCode!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
