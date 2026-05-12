import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'audit_log' })
@Index('audit_log_tenant_table_idx', ['tenantId', 'tableName', 'id'])
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'text', name: 'table_name' })
  tableName!: string;

  @Column({ type: 'text', name: 'row_pk' })
  rowPk!: string;

  @Column({ type: 'text' })
  action!: 'INSERT' | 'UPDATE' | 'DELETE';

  @Column({ type: 'jsonb', name: 'before_jsonb', nullable: true })
  beforeJsonb?: unknown;

  @Column({ type: 'jsonb', name: 'after_jsonb', nullable: true })
  afterJsonb?: unknown;

  @Column({ type: 'uuid', name: 'actor_user_id', nullable: true })
  actorUserId?: string | null;

  @Column({ type: 'uuid', name: 'request_id', nullable: true })
  requestId?: string | null;

  @Column({ type: 'timestamptz', name: 'at_utc' })
  atUtc!: Date;

  @Column({ type: 'bytea', name: 'prev_hash' })
  prevHash!: Buffer;

  @Column({ type: 'bytea', name: 'row_hash' })
  rowHash!: Buffer;
}
