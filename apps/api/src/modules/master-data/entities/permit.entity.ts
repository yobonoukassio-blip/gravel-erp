import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type PermitType = 'exploration' | 'exploitation' | 'environnemental' | 'explosifs';

@Entity({ name: 'permits' })
@Index('permits_site_reference_uq', ['siteId', 'reference'], { unique: true })
export class Permit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'text' })
  type!: PermitType;

  @Column({ type: 'text' })
  authority!: string;

  @Column({ type: 'text' })
  reference!: string;

  @Column({ type: 'date', name: 'valid_from' })
  validFrom!: string;

  @Column({ type: 'date', name: 'valid_to' })
  validTo!: string;

  @Column({ type: 'text', name: 'document_url', nullable: true })
  documentUrl?: string | null;

  @Column({ type: 'text', default: 'active' })
  status!: 'active' | 'expired' | 'archived';

  @Column({ type: 'timestamptz', name: 'archived_at', nullable: true })
  archivedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
