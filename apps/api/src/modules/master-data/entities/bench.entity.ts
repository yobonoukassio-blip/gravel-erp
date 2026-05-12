import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'benches' })
@Index('benches_zone_code_uq', ['productionZoneId', 'code'], { unique: true })
export class Bench {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'production_zone_id' })
  productionZoneId!: string;

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

  @Column({ type: 'numeric', precision: 8, scale: 2, name: 'elevation_m', nullable: true })
  elevationM?: string | null;

  @Column({ type: 'text', default: 'active' })
  status!: 'active' | 'archived';

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
