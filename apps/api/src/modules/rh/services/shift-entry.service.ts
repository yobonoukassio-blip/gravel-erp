import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateShiftEntryInput {
  tenantId: string;
  siteId: string;
  operationalDayId: string;
  employeeId: string;
  checkInUtc: Date;
  positionCode?: string | null;
  supervisorId: string;
}

export interface ShiftEntryRow {
  id: string;
  tenant_id: string;
  site_id: string;
  operational_day_id: string;
  employee_id: string;
  check_in_utc: string;
  check_out_utc: string | null;
  position_code: string | null;
  supervisor_id: string;
  supersedes_id: string | null;
  created_at_utc: string;
}

/**
 * ShiftEntryService (RH-02) — append-only.
 *
 * Does NOT expose update() or delete(). Corrections are created via
 * create() with a `supersedesId` reference to the original row.
 */
@Injectable()
export class ShiftEntryService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(input: CreateShiftEntryInput): Promise<ShiftEntryRow> {
    const rows = (await this.ds.query(
      `INSERT INTO shift_entry (
         tenant_id, site_id, operational_day_id, employee_id,
         check_in_utc, position_code, supervisor_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.tenantId,
        input.siteId,
        input.operationalDayId,
        input.employeeId,
        input.checkInUtc,
        input.positionCode ?? null,
        input.supervisorId,
      ],
    )) as ShiftEntryRow[];

    return rows[0];
  }

  /**
   * Record check-out for an existing shift entry.
   *
   * Because shift_entry is append-only at the DB level, this method creates a
   * NEW row with the check_out_utc populated and sets supersedes_id to the
   * original entry id.
   */
  async recordCheckOut(
    originalId: string,
    tenantId: string,
    checkOutUtc: Date,
  ): Promise<ShiftEntryRow> {
    const original = await this.findById(originalId, tenantId);

    if (original.check_out_utc !== null) {
      throw new BadRequestException({
        code: 'SHIFT_ENTRY_ALREADY_CHECKED_OUT',
        message: 'Check-out already recorded for this entry. Create a new entry to correct.',
      });
    }

    const rows = (await this.ds.query(
      `INSERT INTO shift_entry (
         tenant_id, site_id, operational_day_id, employee_id,
         check_in_utc, check_out_utc, position_code, supervisor_id, supersedes_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        original.tenant_id,
        original.site_id,
        original.operational_day_id,
        original.employee_id,
        original.check_in_utc,
        checkOutUtc,
        original.position_code,
        original.supervisor_id,
        originalId,
      ],
    )) as ShiftEntryRow[];

    return rows[0];
  }

  async findById(id: string, tenantId: string): Promise<ShiftEntryRow> {
    const rows = (await this.ds.query(
      `SELECT * FROM shift_entry WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    )) as ShiftEntryRow[];

    if (rows.length === 0) {
      throw new NotFoundException({ code: 'SHIFT_ENTRY_NOT_FOUND' });
    }
    return rows[0];
  }

  async listForOperationalDay(
    tenantId: string,
    operationalDayId: string,
  ): Promise<ShiftEntryRow[]> {
    return (await this.ds.query(
      `SELECT * FROM shift_entry
        WHERE tenant_id = $1 AND operational_day_id = $2
        ORDER BY check_in_utc ASC`,
      [tenantId, operationalDayId],
    )) as ShiftEntryRow[];
  }
}
