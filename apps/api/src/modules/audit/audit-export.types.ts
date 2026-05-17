/**
 * HRD-MVP-05 — types for the per-tenant audit export (D-14/15/16).
 *
 * Shape returned by AuditExportService and the GET /api/audit/export controller.
 */

import type { ChainVerifyResult } from './audit-chain.verifier';

export interface AuditExportRequest {
  readonly tenantId: string;
  readonly from: Date;
  readonly to: Date;
}

export interface AuditExportRow {
  readonly id: string;
  readonly tenantId: string;
  readonly tableName: string;
  readonly rowPk: string;
  readonly action: 'INSERT' | 'UPDATE' | 'DELETE';
  readonly atUtc: string;
  readonly actorUserId: string | null;
  readonly prevHashHex: string;
  readonly rowHashHex: string;
}

/**
 * Per-(tenant,table) chain verification result for the export window.
 * Wraps the existing AuditChainVerifier output with the table name + a
 * row count restricted to the requested window.
 */
export interface AuditExportChainEntry {
  readonly tableName: string;
  readonly valid: boolean;
  readonly brokenAt: string | null;
  readonly rowsChecked: number;
  readonly rowsInWindow: number;
  readonly verifiedAt: string;
}

export interface AuditExportResponse {
  readonly auditRows: AuditExportRow[];
  readonly chainVerification: AuditExportChainEntry[];
  /** S3 presigned GET URL, 24h expiry per D-15. */
  readonly complianceCsvUrl: string;
  readonly generatedAt: string;
  readonly signedBy: 'gravel-audit-export-v1';
}

export type { ChainVerifyResult };
