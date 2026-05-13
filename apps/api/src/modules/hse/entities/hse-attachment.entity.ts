import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * HseAttachment (D2-61, ADR-0008) — content-addressed S3 attachment record.
 *
 * Upload flow:
 *   1. Client computes SHA-256 of file bytes.
 *   2. Client calls POST /hse-attachments/upload-url to get a pre-signed PUT.
 *   3. Client uploads directly to S3 (Object Lock GOVERNANCE mode, 7-year retain).
 *   4. Client calls POST /hse-attachments/confirm to validate and persist this row.
 *
 * The s3_object_key is the SHA-256 hex of the file content — content-addressed.
 * Uniqueness: (tenant_id, incident_id, sha256_hex) prevents duplicate photo rows.
 */
@Entity({ name: 'hse_attachment' })
@Index('hse_attachment_incident_idx', ['tenantId', 'incidentId'])
@Index('hse_attachment_sha256_idx', ['tenantId', 'sha256Hex'])
export class HseAttachment {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id!: string;

  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'incident_id' })
  incidentId!: string;

  /** SHA-256 hex of the uploaded file bytes. */
  @Column({ type: 'varchar', length: 64, name: 'sha256_hex' })
  sha256Hex!: string;

  @Column({ type: 'varchar', length: 100, name: 's3_bucket' })
  s3Bucket!: string;

  /** Object key in S3 = sha256_hex (content-addressed). */
  @Column({ type: 'varchar', length: 200, name: 's3_object_key' })
  s3ObjectKey!: string;

  @Column({ type: 'varchar', length: 100, name: 'content_type' })
  contentType!: string;

  @Column({ type: 'bigint', name: 'size_bytes' })
  sizeBytes!: string;

  @Column({ type: 'uuid', name: 'uploaded_by' })
  uploadedBy!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'uploaded_at_utc' })
  uploadedAtUtc!: Date;
}
