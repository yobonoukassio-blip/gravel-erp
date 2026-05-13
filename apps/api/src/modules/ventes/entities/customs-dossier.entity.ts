import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** CustomsDossier (VTE-06) — auto-created for export BLs. */
@Entity({ name: 'customs_dossier' })
@Index('customs_bl_uq', ['blId'], { unique: true })
export class CustomsDossier {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'bl_id' })
  blId!: string;

  @Column({ type: 'varchar', length: 100, name: 'declaration_number', nullable: true })
  declarationNumber!: string | null;

  @Column({ type: 'varchar', length: 3, name: 'destination_country' })
  destinationCountry!: string;

  @Column({ type: 'jsonb', name: 'certificates', default: () => `'[]'::jsonb` })
  certificates!: unknown;

  @Column({ type: 'varchar', length: 30, default: 'pending' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
