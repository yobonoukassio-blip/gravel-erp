import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'node:crypto';
import { WeighingTicket } from '../entities/weighing-ticket.entity';
import { TicketNumberGeneratorService } from './ticket-number-generator.service';

/**
 * Error codes (audit anchors):
 *   - ERR_CONTENT_HASH_MISMATCH
 *   - INVALID_TICKET_NUMBER_FORMAT
 *   - DUPLICATE_TICKET_NUMBER
 */
export const ERR_CONTENT_HASH_MISMATCH = 'ERR_CONTENT_HASH_MISMATCH';
export const ERR_DUPLICATE_TICKET_NUMBER = 'DUPLICATE_TICKET_NUMBER';

export interface CreateWeighingTicketInput {
  tenantId: string;
  siteId: string;
  ticketNumber: string;
  grossKg: number;
  tareKg: number;
  truckEquipmentId: string;
  driverId: string;
  materialType: 'granite_brut' | 'tout_venant' | 'sterile';
  weighedAtLocal: Date;
  ianaTimezone: string;
  operationalDayId: string;
  operatorUserId: string;
  weighingStationCode: string;
  clientSignatureBlobSha256?: string | null;
  driverSignatureBlobSha256?: string | null;
  notes?: string | null;
  isOfflineGenerated: boolean;
  /** Hash computed by client. Server recomputes and rejects on mismatch. */
  clientContentHash: string;
  createdBy: string;
}

/**
 * Canonical payload for content_hash (ADR-0009).
 *
 * Field order is significant — we use `JSON.stringify` on an object with
 * ordered keys (the explicit object below is the contract). DO NOT add
 * fields without also updating ADR-0009 and the mobile client.
 */
export interface ContentHashPayload {
  ticket_number: string;
  gross_kg: number;
  tare_kg: number;
  net_kg: number;
  truck_equipment_id: string;
  driver_id: string;
  material_type: string;
  weighed_at_local: string; // ISO local (no TZ suffix)
  iana_timezone: string;
  weighing_station_code: string;
  client_signature_sha256: string | null;
  driver_signature_sha256: string | null;
}

@Injectable()
export class WeighingTicketService {
  constructor(
    @InjectRepository(WeighingTicket)
    private readonly repo: Repository<WeighingTicket>,
    private readonly numbering: TicketNumberGeneratorService,
  ) {}

  /**
   * Compute SHA-256 of the canonical payload. The canonical form is the
   * `JSON.stringify` of the ordered ContentHashPayload object below.
   */
  computeContentHash(payload: ContentHashPayload): string {
    const ordered: ContentHashPayload = {
      ticket_number: payload.ticket_number,
      gross_kg: payload.gross_kg,
      tare_kg: payload.tare_kg,
      net_kg: payload.net_kg,
      truck_equipment_id: payload.truck_equipment_id,
      driver_id: payload.driver_id,
      material_type: payload.material_type,
      weighed_at_local: payload.weighed_at_local,
      iana_timezone: payload.iana_timezone,
      weighing_station_code: payload.weighing_station_code,
      client_signature_sha256: payload.client_signature_sha256,
      driver_signature_sha256: payload.driver_signature_sha256,
    };
    return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
  }

  /** Format the weighed_at_local timestamp into the canonical ISO local string. */
  private canonicalLocalTs(d: Date): string {
    // Match what the mobile client produces: YYYY-MM-DDTHH:mm:ss (no TZ offset).
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
      `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
    );
  }

  /**
   * Create a ticket. TRP-02 contract:
   *   1) Validate ticket_number format.
   *   2) Recompute net_kg = gross_kg - tare_kg (server never trusts client).
   *   3) Recompute content_hash and compare to clientContentHash → reject mismatch.
   *   4) INSERT. On UNIQUE collision return 409 DUPLICATE_TICKET_NUMBER.
   */
  async create(input: CreateWeighingTicketInput): Promise<WeighingTicket> {
    if (input.grossKg <= 0) {
      throw new BadRequestException({
        code: 'INVALID_GROSS_KG',
        message: 'gross_kg must be > 0',
      });
    }
    if (input.tareKg < 0) {
      throw new BadRequestException({
        code: 'INVALID_TARE_KG',
        message: 'tare_kg must be >= 0',
      });
    }
    if (input.grossKg <= input.tareKg) {
      throw new BadRequestException({
        code: 'GROSS_NOT_GREATER_THAN_TARE',
        message: 'gross_kg must be greater than tare_kg',
      });
    }

    this.numbering.validate(input.ticketNumber);

    const netKg = input.grossKg - input.tareKg;
    const canonical: ContentHashPayload = {
      ticket_number: input.ticketNumber,
      gross_kg: input.grossKg,
      tare_kg: input.tareKg,
      net_kg: netKg,
      truck_equipment_id: input.truckEquipmentId,
      driver_id: input.driverId,
      material_type: input.materialType,
      weighed_at_local: this.canonicalLocalTs(input.weighedAtLocal),
      iana_timezone: input.ianaTimezone,
      weighing_station_code: input.weighingStationCode,
      client_signature_sha256: input.clientSignatureBlobSha256 ?? null,
      driver_signature_sha256: input.driverSignatureBlobSha256 ?? null,
    };
    const serverHash = this.computeContentHash(canonical);

    if (serverHash !== input.clientContentHash) {
      throw new BadRequestException({
        code: ERR_CONTENT_HASH_MISMATCH,
        message:
          'Client-supplied content_hash does not match server recomputation',
      });
    }

    const existing = await this.repo.findOne({
      where: {
        tenantId: input.tenantId,
        ticketNumber: input.ticketNumber,
      },
    });
    if (existing) {
      throw new ConflictException({
        code: ERR_DUPLICATE_TICKET_NUMBER,
        message: `Ticket ${input.ticketNumber} already exists`,
      });
    }

    const row = this.repo.create({
      tenantId: input.tenantId,
      siteId: input.siteId,
      ticketNumber: input.ticketNumber,
      grossKg: input.grossKg,
      tareKg: input.tareKg,
      truckEquipmentId: input.truckEquipmentId,
      driverId: input.driverId,
      materialType: input.materialType,
      weighedAtLocal: input.weighedAtLocal,
      ianaTimezone: input.ianaTimezone,
      operationalDayId: input.operationalDayId,
      operatorUserId: input.operatorUserId,
      weighingStationCode: input.weighingStationCode,
      clientSignatureBlobSha256: input.clientSignatureBlobSha256 ?? null,
      driverSignatureBlobSha256: input.driverSignatureBlobSha256 ?? null,
      notes: input.notes ?? null,
      isOfflineGenerated: input.isOfflineGenerated,
      contentHash: serverHash,
      createdBy: input.createdBy,
    });

    return this.repo.save(row);
  }

  async findById(id: string, tenantId: string): Promise<WeighingTicket> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`WeighingTicket ${id} not found`);
    return row;
  }

  async listForOperationalDay(
    operationalDayId: string,
    tenantId: string,
  ): Promise<WeighingTicket[]> {
    return this.repo.find({
      where: { tenantId, operationalDayId },
      order: { weighedAtLocal: 'ASC' },
    });
  }
}
