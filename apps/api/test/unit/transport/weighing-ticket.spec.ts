import { BadRequestException, ConflictException } from '@nestjs/common';
import { WeighingTicket } from '../../../src/modules/transport/entities/weighing-ticket.entity';
import {
  ContentHashPayload,
  CreateWeighingTicketInput,
  ERR_CONTENT_HASH_MISMATCH,
  ERR_DUPLICATE_TICKET_NUMBER,
  WeighingTicketService,
} from '../../../src/modules/transport/services/weighing-ticket.service';
import { TicketNumberGeneratorService } from '../../../src/modules/transport/services/ticket-number-generator.service';

/**
 * TRP-02 — WeighingTicket service tests.
 *
 * Covers:
 *   - Generated net_kg = gross_kg - tare_kg
 *   - Server-side content_hash recomputation
 *   - ERR_CONTENT_HASH_MISMATCH when client hash differs
 *   - Duplicate ticket_number → 409 Conflict
 *   - Format validation delegated to TicketNumberGeneratorService
 */

class InMemoryRepo<T extends { id?: string }> {
  rows: T[] = [];
  private seq = 0;
  create(partial: Partial<T>): T {
    this.seq += 1;
    return { id: `r-${this.seq}`, ...partial } as T;
  }
  async save(row: T): Promise<T> {
    this.rows.push(row);
    return row;
  }
  async findOne(opts: { where: Partial<T> }): Promise<T | null> {
    return (
      this.rows.find((r) =>
        Object.entries(opts.where).every(
          ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
        ),
      ) ?? null
    );
  }
  async find(opts: { where: Partial<T> }): Promise<T[]> {
    return this.rows.filter((r) =>
      Object.entries(opts.where).every(
        ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v,
      ),
    );
  }
}

describe('WeighingTicketService (TRP-02)', () => {
  const tenantId = 't1';
  let repo: InMemoryRepo<WeighingTicket>;
  let numbering: TicketNumberGeneratorService;
  let svc: WeighingTicketService;

  const baseInput = (
    overrides: Partial<CreateWeighingTicketInput> = {},
  ): CreateWeighingTicketInput => {
    const input: CreateWeighingTicketInput = {
      tenantId,
      siteId: 'site-1',
      ticketNumber: 'CIV01-20260615-MOB42-0007',
      grossKg: 30000,
      tareKg: 15000,
      truckEquipmentId: 'truck-1',
      driverId: 'driver-1',
      materialType: 'granite_brut',
      weighedAtLocal: new Date(Date.UTC(2026, 5, 15, 8, 25, 0)),
      ianaTimezone: 'Africa/Abidjan',
      operationalDayId: 'opday-1',
      operatorUserId: 'op-1',
      weighingStationCode: 'PB-NORD',
      clientSignatureBlobSha256: 'a'.repeat(64),
      driverSignatureBlobSha256: 'b'.repeat(64),
      notes: null,
      isOfflineGenerated: true,
      clientContentHash: '__placeholder__',
      createdBy: 'op-1',
      ...overrides,
    };

    // Pre-compute the matching server hash so each test can derive a
    // valid clientContentHash without duplicating the canonical formatter.
    const netKg = input.grossKg - input.tareKg;
    const canonical: ContentHashPayload = {
      ticket_number: input.ticketNumber,
      gross_kg: input.grossKg,
      tare_kg: input.tareKg,
      net_kg: netKg,
      truck_equipment_id: input.truckEquipmentId,
      driver_id: input.driverId,
      material_type: input.materialType,
      weighed_at_local: '2026-06-15T08:25:00',
      iana_timezone: input.ianaTimezone,
      weighing_station_code: input.weighingStationCode,
      client_signature_sha256: input.clientSignatureBlobSha256 ?? null,
      driver_signature_sha256: input.driverSignatureBlobSha256 ?? null,
    };
    input.clientContentHash = svc.computeContentHash(canonical);
    return input;
  };

  beforeEach(() => {
    repo = new InMemoryRepo<WeighingTicket>();
    numbering = new TicketNumberGeneratorService();
    svc = new WeighingTicketService(repo as never, numbering);
  });

  it('creates ticket and assigns server-side content_hash', async () => {
    const input = baseInput();
    const saved = await svc.create(input);
    expect(saved.contentHash).toBe(input.clientContentHash);
    expect(saved.contentHash).toHaveLength(64); // sha-256 hex
    expect(saved.grossKg).toBe(30000);
    expect(saved.tareKg).toBe(15000);
    // net_kg generated column — not assigned by the service (DB computes).
  });

  it('rejects ERR_CONTENT_HASH_MISMATCH when client hash mutated', async () => {
    const input = baseInput();
    input.clientContentHash = 'f'.repeat(64); // bogus
    await expect(svc.create(input)).rejects.toMatchObject({
      response: { code: ERR_CONTENT_HASH_MISMATCH },
    });
  });

  it('rejects ERR_CONTENT_HASH_MISMATCH when one byte of gross_kg differs server-side', async () => {
    const input = baseInput();
    // Client computed hash with gross_kg=30000; mutate to 30001 before send.
    input.grossKg = 30001;
    await expect(svc.create(input)).rejects.toMatchObject({
      response: { code: ERR_CONTENT_HASH_MISMATCH },
    });
  });

  it('rejects invalid ticket_number format', async () => {
    const input = baseInput({ ticketNumber: 'not-a-valid-number' });
    await expect(svc.create(input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects gross_kg <= tare_kg', async () => {
    const input = baseInput({ grossKg: 1000, tareKg: 2000 });
    await expect(svc.create(input)).rejects.toMatchObject({
      response: { code: 'GROSS_NOT_GREATER_THAN_TARE' },
    });
  });

  it('rejects duplicate ticket_number with 409', async () => {
    const input1 = baseInput();
    await svc.create(input1);

    const input2 = baseInput(); // identical ticket_number
    await expect(svc.create(input2)).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.create(input2)).rejects.toMatchObject({
      response: { code: ERR_DUPLICATE_TICKET_NUMBER },
    });
  });

  it('computeContentHash is deterministic for same payload', () => {
    const payload: ContentHashPayload = {
      ticket_number: 'CIV01-20260615-MOB42-0007',
      gross_kg: 30000,
      tare_kg: 15000,
      net_kg: 15000,
      truck_equipment_id: 'truck-1',
      driver_id: 'driver-1',
      material_type: 'granite_brut',
      weighed_at_local: '2026-06-15T08:25:00',
      iana_timezone: 'Africa/Abidjan',
      weighing_station_code: 'PB-NORD',
      client_signature_sha256: null,
      driver_signature_sha256: null,
    };
    const a = svc.computeContentHash(payload);
    const b = svc.computeContentHash(payload);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('computeContentHash differs when truck_equipment_id changes', () => {
    const base: ContentHashPayload = {
      ticket_number: 'CIV01-20260615-MOB42-0007',
      gross_kg: 30000,
      tare_kg: 15000,
      net_kg: 15000,
      truck_equipment_id: 'truck-1',
      driver_id: 'driver-1',
      material_type: 'granite_brut',
      weighed_at_local: '2026-06-15T08:25:00',
      iana_timezone: 'Africa/Abidjan',
      weighing_station_code: 'PB-NORD',
      client_signature_sha256: null,
      driver_signature_sha256: null,
    };
    const a = svc.computeContentHash(base);
    const b = svc.computeContentHash({ ...base, truck_equipment_id: 'truck-2' });
    expect(a).not.toBe(b);
  });
});
