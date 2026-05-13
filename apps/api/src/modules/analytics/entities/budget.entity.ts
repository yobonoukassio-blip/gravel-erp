import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type BudgetCategory =
  | 'extraction'
  | 'transport'
  | 'concassage'
  | 'criblage'
  | 'carburant'
  | 'main_oeuvre'
  | 'amortissement'
  | 'hse'
  | 'maintenance';

/** Budget (FIN-03) — annual per site × cost category. */
@Entity({ name: 'budget' })
@Index('budget_tenant_site_year_category_uq', ['tenantId', 'siteId', 'year', 'category'], {
  unique: true,
})
export class Budget {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({
    type: 'enum',
    enum: [
      'extraction',
      'transport',
      'concassage',
      'criblage',
      'carburant',
      'main_oeuvre',
      'amortissement',
      'hse',
      'maintenance',
    ],
  })
  category!: BudgetCategory;

  @Column({ type: 'bigint', name: 'budget_minor_units' })
  budgetMinorUnits!: string;

  @Column({ type: 'varchar', length: 3 })
  currency!: string;
}
