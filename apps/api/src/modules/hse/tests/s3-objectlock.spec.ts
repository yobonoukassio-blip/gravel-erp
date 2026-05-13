/**
 * S3 Object Lock upload URL tests (HSE-01, D2-61, ADR-0008).
 *
 * Tests:
 *   1. requestUploadUrl → URL contains x-amz-object-lock-mode=GOVERNANCE
 *   2. confirmUpload with matching SHA → success
 *   3. confirmUpload with mismatched SHA → 400 ERR_HASH_MISMATCH
 *
 * Run: pnpm --filter=@gravel/api test s3-objectlock
 */

import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { HseAttachmentService } from '../services/hse-attachment.service';

describe('HseAttachmentService — S3 Object Lock', () => {
  let service: HseAttachmentService;
  const tenantId = randomUUID();
  const incidentId = randomUUID();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HseAttachmentService,
        {
          provide: getDataSourceToken(),
          useValue: {
            query: jest.fn(async (sql: string, params: unknown[]) => {
              if (sql.includes('INSERT INTO hse_attachment')) {
                return [
                  {
                    id: randomUUID(),
                    tenant_id: params[0],
                    incident_id: params[1],
                    sha256_hex: params[2],
                    s3_bucket: params[3],
                    s3_object_key: params[4],
                    content_type: params[5],
                    size_bytes: params[6],
                    uploaded_by: params[7],
                    uploaded_at_utc: new Date().toISOString(),
                  },
                ];
              }
              return [];
            }),
          },
        },
      ],
    }).compile();

    service = module.get(HseAttachmentService);
  });

  describe('requestUploadUrl()', () => {
    it('returns a URL containing x-amz-object-lock-mode=GOVERNANCE', async () => {
      const sha256Hex = 'a'.repeat(64);
      const result = await service.requestUploadUrl({
        tenantId,
        incidentId,
        sha256Hex,
        contentType: 'image/jpeg',
        sizeBytes: 512_000,
        uploadedBy: randomUUID(),
      });

      expect(result.upload_url).toContain('x-amz-object-lock-mode=GOVERNANCE');
      expect(result.lock_mode).toBe('GOVERNANCE');
      expect(result.object_key).toBe(sha256Hex);
    });

    it('sets retain_until to approximately 7 years from now', async () => {
      const sha256Hex = 'b'.repeat(64);
      const before = Date.now();
      const result = await service.requestUploadUrl({
        tenantId,
        incidentId,
        sha256Hex,
        contentType: 'image/png',
        sizeBytes: 1_000_000,
        uploadedBy: randomUUID(),
      });

      const retainUntil = new Date(result.retain_until).getTime();
      const sevenYearsMs = 7 * 365.25 * 24 * 60 * 60 * 1000;
      const delta = Math.abs(retainUntil - (before + sevenYearsMs));
      // Allow 5-second tolerance for test runtime.
      expect(delta).toBeLessThan(5_000);
    });
  });

  describe('confirmUpload()', () => {
    it('persists attachment row when SHA-256 matches', async () => {
      const sha256Hex = 'c'.repeat(64);
      const attachment = await service.confirmUpload({
        tenantId,
        incidentId,
        sha256Hex,
        receivedSha256Hex: sha256Hex, // match
        contentType: 'image/jpeg',
        sizeBytes: 256_000,
        s3Bucket: 'gravel-hse-attachments-dev',
        uploadedBy: randomUUID(),
      });

      expect(attachment.sha256Hex).toBe(sha256Hex);
      expect(attachment.incidentId).toBe(incidentId);
    });

    it('throws 400 ERR_HASH_MISMATCH when SHA-256 does not match', async () => {
      const sha256Hex = 'd'.repeat(64);
      const wrongSha = 'e'.repeat(64);

      await expect(
        service.confirmUpload({
          tenantId,
          incidentId,
          sha256Hex,
          receivedSha256Hex: wrongSha, // mismatch
          contentType: 'image/jpeg',
          sizeBytes: 256_000,
          s3Bucket: 'gravel-hse-attachments-dev',
          uploadedBy: randomUUID(),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ERR_HASH_MISMATCH' }),
      });

      await expect(
        service.confirmUpload({
          tenantId,
          incidentId,
          sha256Hex,
          receivedSha256Hex: wrongSha,
          contentType: 'image/jpeg',
          sizeBytes: 256_000,
          s3Bucket: 'gravel-hse-attachments-dev',
          uploadedBy: randomUUID(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
