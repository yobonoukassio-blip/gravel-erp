import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * IotReadingRaw (IOT-04 layer 1: RAW).
 *
 * Every IoT reading lands here first, untouched. Includes data_quality_flag
 * set later by the validator. Hypertable when TimescaleDB is enabled.
 */
@Entity({ name: 'iot_reading_raw' })
@Index('iot_raw_tenant_device_ts_idx', ['tenantId', 'deviceId', 'observedAtUtc'])
export class IotReadingRaw {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'site_id', nullable: true })
  siteId!: string | null;

  @Column({ type: 'varchar', length: 100, name: 'device_id' })
  deviceId!: string;

  @Column({ type: 'varchar', length: 50, name: 'sensor_type' })
  sensorType!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'observed_at_utc' })
  observedAtUtc!: Date;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'data_quality_flag',
    default: 'unvalidated',
  })
  dataQualityFlag!: 'unvalidated' | 'valid' | 'invalid' | 'suspect';

  @CreateDateColumn({ name: 'received_at_utc', type: 'timestamptz' })
  receivedAtUtc!: Date;
}
