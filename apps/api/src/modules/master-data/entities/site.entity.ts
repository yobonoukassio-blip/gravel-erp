import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Site — physical mining/quarry operation. D-23, D-24.
 * PostGIS Point for GPS; IANA timezone string for OperationalDay resolution.
 */
@Entity({ name: 'sites' })
@Index('sites_tenant_code_uq', ['tenantId', 'code'], { unique: true })
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'country_id' })
  countryId!: string;

  @Column({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    name: 'gps_point',
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gpsPoint!: any;

  @Column({ type: 'text', name: 'iana_timezone' })
  ianaTimezone!: string;

  @Column({ type: 'char', length: 3, name: 'functional_currency' })
  functionalCurrency!: string;

  @Column({ type: 'uuid', name: 'manager_user_id', nullable: true })
  managerUserId?: string | null;

  @Column({ type: 'bigint', name: 'capacity_t_per_day', nullable: true })
  capacityTPerDay?: string | null;

  @Column({ type: 'text', default: 'active' })
  status!: 'active' | 'standby' | 'closed' | 'archived';

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
