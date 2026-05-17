import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type EpiCategory =
  | 'casque'
  | 'gilet'
  | 'chaussures'
  | 'gants'
  | 'masque'
  | 'lunettes'
  | 'harnais'
  | 'bouchons'
  | 'autre';

/**
 * HSE-03 EPI master catalog row.
 *
 * RLS by tenant. is_mandatory drives compliance checks (an employee
 * missing a mandatory EPI in their open assignments is flagged).
 */
@Entity({ name: 'epi_item' })
@Index('epi_item_tenant_idx', ['tenantId'])
export class EpiItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  category!: EpiCategory;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_mandatory', type: 'boolean', default: false })
  isMandatory!: boolean;

  @CreateDateColumn({ name: 'created_at_utc', type: 'timestamptz' })
  createdAtUtc!: Date;
}
