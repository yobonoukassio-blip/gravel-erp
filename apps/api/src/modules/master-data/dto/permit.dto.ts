import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';

export const PERMIT_TYPES = ['exploration', 'exploitation', 'environnemental', 'explosifs'] as const;
export type PermitTypeLiteral = (typeof PERMIT_TYPES)[number];

export class CreatePermitDto {
  @IsUUID()
  siteId!: string;

  @IsString()
  @IsIn(PERMIT_TYPES as unknown as string[])
  type!: PermitTypeLiteral;

  @IsString()
  authority!: string;

  @IsString()
  reference!: string;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validTo!: string;

  /**
   * Reference to a content-addressed S3 object key (sha256). Optional at
   * create time; can be linked later via PATCH once the attachment upload
   * completes.
   */
  @IsOptional()
  @IsString()
  documentUrl?: string;
}

export class UpdatePermitDto {
  @IsOptional()
  @IsString()
  authority?: string;

  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsOptional()
  @IsString()
  documentUrl?: string;
}

/**
 * Attachment presign request — D-29 immutable content-addressed storage.
 * The client computes the SHA-256 client-side, the server returns a
 * presigned PUT URL keyed by that hash. Two uploads with the same content
 * naturally dedupe.
 */
export class AttachmentPresignDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'sha256 must be 64 hex chars' })
  sha256!: string;

  @IsInt()
  @Min(1)
  size!: number;

  @IsString()
  mime!: string;
}
