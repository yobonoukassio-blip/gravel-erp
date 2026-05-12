import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EquipmentType = 'drill' | 'excavator' | 'truck' | 'generator';
export type EquipmentStatus = 'active' | 'maintenance' | 'out_of_service';

/**
 * Phase 2 light equipment registry (D2-14).
 * Maintenance plans + preventive scheduling arrive Phase 3 in the
 * `maintenance` module — this entity is intentionally minimal.
 */
@Entity({ name: 'production_equipment' })
@Index('production_equipment_tenant_site_code_uq', ['tenantId', 'siteId', 'code'], {
  unique: true,
})
export class ProductionEquipment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  label!: string;

  @Column({ type: 'enum', enum: ['drill', 'excavator', 'truck', 'generator'] })
  type!: EquipmentType;

  @Column({
    type: 'enum',
    enum: ['active', 'maintenance', 'out_of_service'],
    default: 'active',
  })
  status!: EquipmentStatus;

  @Column({ type: 'jsonb', default: () => `'{}'::jsonb` })
  specs!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
