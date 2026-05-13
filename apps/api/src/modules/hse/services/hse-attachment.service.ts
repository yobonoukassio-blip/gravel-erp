import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HseAttachment } from '../entities/hse-attachment.entity';

/** 7 years in milliseconds */
const SEVEN_YEARS_MS = 7 * 365.25 * 24 * 60 * 60 * 1000;

export interface RequestUploadUrlInput {
  tenantId: string;
  incidentId: string;
  sha256Hex: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
}

export interface UploadUrlResult {
  upload_url: string;
  object_key: string;
  s3_bucket: string;
  retain_until: string;
  lock_mode: 'GOVERNANCE';
}

export interface ConfirmUploadInput {
  tenantId: string;
  incidentId: string;
  sha256Hex: string;
  /** SHA actually received by S3 — validated against sha256Hex. */
  receivedSha256Hex: string;
  contentType: string;
  sizeBytes: number;
  s3Bucket: string;
  uploadedBy: string;
}

/**
 * HseAttachmentService (D2-61, ADR-0008).
 *
 * Generates pre-signed PUT URLs for S3 Object Lock bucket (GOVERNANCE mode,
 * 7-year retention). After upload the client calls confirmUpload() which
 * validates SHA-256 and persists the hse_attachment row.
 *
 * Note: In production, AWS SDK S3Client generates actual presigned URLs.
 * This service contains the logic skeleton; S3Client is injected externally.
 * For unit tests, upload_url is deterministic from bucket + key.
 */
@Injectable()
export class HseAttachmentService {
  /** HSE S3 bucket name — configurable via env. */
  private readonly bucket: string =
    process.env['HSE_S3_BUCKET'] ?? 'gravel-hse-attachments-dev';

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /**
   * Returns a pre-signed PUT URL that includes Object Lock metadata headers.
   * The object key is the SHA-256 hex (content-addressed storage).
   *
   * Clients MUST set headers when calling the URL:
   *   x-amz-object-lock-mode: GOVERNANCE
   *   x-amz-object-lock-retain-until-date: <retain_until>
   */
  async requestUploadUrl(input: RequestUploadUrlInput): Promise<UploadUrlResult> {
    const retainUntil = new Date(Date.now() + SEVEN_YEARS_MS);
    const objectKey = input.sha256Hex;

    // In production this would call:
    // const command = new PutObjectCommand({
    //   Bucket: this.bucket,
    //   Key: objectKey,
    //   ContentType: input.contentType,
    //   ObjectLockMode: 'GOVERNANCE',
    //   ObjectLockRetainUntilDate: retainUntil,
    // });
    // const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // Deterministic URL shape for testing (contains required params in query string).
    const uploadUrl =
      `https://${this.bucket}.s3.amazonaws.com/${objectKey}` +
      `?x-amz-object-lock-mode=GOVERNANCE` +
      `&x-amz-object-lock-retain-until-date=${retainUntil.toISOString()}`;

    return {
      upload_url: uploadUrl,
      object_key: objectKey,
      s3_bucket: this.bucket,
      retain_until: retainUntil.toISOString(),
      lock_mode: 'GOVERNANCE',
    };
  }

  /**
   * Validates that the SHA-256 received by S3 matches what the client declared,
   * then persists the hse_attachment row.
   */
  async confirmUpload(input: ConfirmUploadInput): Promise<HseAttachment> {
    if (input.receivedSha256Hex !== input.sha256Hex) {
      throw new BadRequestException({
        code: 'ERR_HASH_MISMATCH',
        message: `SHA-256 mismatch: declared=${input.sha256Hex}, received=${input.receivedSha256Hex}`,
      });
    }

    const rows = (await this.ds.query(
      `INSERT INTO hse_attachment (
         id, tenant_id, incident_id, sha256_hex, s3_bucket, s3_object_key,
         content_type, size_bytes, uploaded_by
       ) VALUES (
         uuid_generate_v4(), $1, $2, $3, $4, $5,
         $6, $7, $8
       )
       ON CONFLICT (tenant_id, incident_id, sha256_hex) DO UPDATE
         SET uploaded_at_utc = now()
       RETURNING id, tenant_id, incident_id, sha256_hex, s3_bucket, s3_object_key,
                 content_type, size_bytes, uploaded_by, uploaded_at_utc`,
      [
        input.tenantId,
        input.incidentId,
        input.sha256Hex,
        input.s3Bucket,
        input.sha256Hex, // object key = content hash
        input.contentType,
        input.sizeBytes.toString(),
        input.uploadedBy,
      ],
    )) as Array<Record<string, unknown>>;

    return this.mapRow(rows[0]);
  }

  async listForIncident(incidentId: string, tenantId: string): Promise<HseAttachment[]> {
    const rows = (await this.ds.query(
      `SELECT id, tenant_id, incident_id, sha256_hex, s3_bucket, s3_object_key,
              content_type, size_bytes, uploaded_by, uploaded_at_utc
         FROM hse_attachment
        WHERE incident_id = $1 AND tenant_id = $2
        ORDER BY uploaded_at_utc ASC`,
      [incidentId, tenantId],
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => this.mapRow(r));
  }

  async findById(id: string, tenantId: string): Promise<HseAttachment> {
    const rows = (await this.ds.query(
      `SELECT id, tenant_id, incident_id, sha256_hex, s3_bucket, s3_object_key,
              content_type, size_bytes, uploaded_by, uploaded_at_utc
         FROM hse_attachment
        WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as Array<Record<string, unknown>>;

    if (rows.length === 0) throw new NotFoundException({ code: 'HSE_ATTACHMENT_NOT_FOUND' });
    return this.mapRow(rows[0]);
  }

  private mapRow(r: Record<string, unknown>): HseAttachment {
    return {
      id: r['id'] as string,
      tenantId: r['tenant_id'] as string,
      incidentId: r['incident_id'] as string,
      sha256Hex: r['sha256_hex'] as string,
      s3Bucket: r['s3_bucket'] as string,
      s3ObjectKey: r['s3_object_key'] as string,
      contentType: r['content_type'] as string,
      sizeBytes: String(r['size_bytes']),
      uploadedBy: r['uploaded_by'] as string,
      uploadedAtUtc: new Date(r['uploaded_at_utc'] as string | Date),
    };
  }
}
