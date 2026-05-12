import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'production_zones' })
@Index('production_zones_site_code_uq', ['siteId', 'code'], { unique: true })
export class ProductionZone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({
    type: 'geometry',
    spatialFeatureType: 'Polygon',
    srid: 4326,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geometry!: any;

  @Column({ type: 'text', default: 'active' })
  status!: 'active' | 'archived';

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
