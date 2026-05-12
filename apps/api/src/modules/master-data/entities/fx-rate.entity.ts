import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * FxRate — IMMUTABLE per D-17. Trigger `fx_rates_no_update` blocks UPDATE/DELETE.
 * Conversions reference `fx_rate_id` so a corrected rate creates a new row.
 */
@Entity({ name: 'fx_rates' })
@Index('fx_rates_lookup_uq', ['tenantId', 'fromCurrency', 'toCurrency', 'validFrom'], { unique: true })
export class FxRate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'char', length: 3, name: 'from_currency' })
  fromCurrency!: string;

  @Column({ type: 'char', length: 3, name: 'to_currency' })
  toCurrency!: string;

  @Column({ type: 'bigint', name: 'rate_numerator' })
  rateNumerator!: string;

  @Column({ type: 'bigint', name: 'rate_denominator' })
  rateDenominator!: string;

  @Column({ type: 'timestamptz', name: 'valid_from' })
  validFrom!: Date;

  @Column({ type: 'timestamptz', name: 'valid_to', nullable: true })
  validTo?: Date | null;

  @Column({ type: 'text' })
  source!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
