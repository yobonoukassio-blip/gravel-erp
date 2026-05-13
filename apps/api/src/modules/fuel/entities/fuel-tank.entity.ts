import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * FuelTank (D2-50, CAR-01) — master row for a physical fuel storage tank.
 *
 * Event ledger lives in fuel_tank_event (append-only, chain-of-hash).
 * Balance is derived from summing liters_delta on demand; a projection
 * table (fuel_tank_balance) maintains the running sum for fast reads.
 */
@Entity({ name: 'fuel_tank' })
@Index('fuel_tank_tenant_site_idx', ['tenantId', 'siteId'])
export class FuelTank {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id' })
  siteId!: string;

  @Column({ type: 'varchar', length: 50, name: 'code' })
  code!: string;

  @Column({ type: 'varchar', length: 200, name: 'label' })
  label!: string;

  /** Physical capacity in litres (CHECK > 0). */
  @Column({ type: 'int', name: 'capacity_liters' })
  capacityLiters!: number;

  /** Fuel type stored (gasoil default; others: essence, jet-a1). */
  @Column({ type: 'varchar', length: 20, name: 'fuel_type', default: 'gasoil' })
  fuelType!: string;

  /** Optional GPS coordinates stored as PostGIS GEOGRAPHY(POINT,4326). */
  @Column({ type: 'geography', name: 'gps_point', nullable: true, spatialFeatureType: 'Point', srid: 4326 })
  gpsPoint?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
