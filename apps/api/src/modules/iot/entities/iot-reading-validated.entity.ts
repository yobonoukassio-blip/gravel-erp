import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** IotReadingValidated (IOT-04 layer 2: VALIDATED). Typed columns, sanity-checked. */
@Entity({ name: 'iot_reading_validated' })
@Index('iot_val_tenant_device_ts_idx', ['tenantId', 'deviceId', 'observedAtUtc'])
export class IotReadingValidated {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'raw_id' })
  rawId!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'device_id' })
  deviceId!: string;

  @Column({ type: 'varchar', length: 50, name: 'sensor_type' })
  sensorType!: string;

  @Column({ type: 'numeric', precision: 14, scale: 4, nullable: true })
  value!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  unit!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  latitude!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 6, nullable: true })
  longitude!: string | null;

  @Column({ type: 'timestamptz', name: 'observed_at_utc' })
  observedAtUtc!: Date;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'data_quality_flag',
  })
  dataQualityFlag!: 'valid' | 'invalid' | 'suspect';

  @Column({ type: 'text', name: 'invalid_reason', nullable: true })
  invalidReason!: string | null;
}
