import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DrilledHole } from '../entities/drilled-hole.entity';
import { DrillingPlan } from '../entities/drilling-plan.entity';

export interface CreateDrilledHoleInput {
  tenantId: string;
  siteId: string;
  planId: string;
  holeIndexInPlan: number;
  gpsLatitude?: number | null;
  gpsLongitude?: number | null;
  gpsAccuracyM?: number | null;
  actualDepthM: number;
  actualDiameterMm: number;
  inclinationDeg?: number | null;
  startedAtLocal: Date;
  endedAtLocal: Date;
  ianaTimezone: string;
  operationalDayId: string;
  operatorId: string;
  machineId: string;
  fuelLitersConsumed?: number | null;
  notesText?: string | null;
  photoBlobSha256?: string | null;
  toleranceViolationReason?: string | null;
  correctsHoleId?: string | null;
  createdBy: string;
}

/** D2-12: hors tolérance si écart profondeur > 10% OU diamètre > 5%. */
export function computeToleranceViolation(
  target: { depthM: number; diameterMm: number },
  actual: { depthM: number; diameterMm: number },
): boolean {
  const depthDeviation = Math.abs(actual.depthM - target.depthM) / target.depthM;
  const diameterDeviation =
    Math.abs(actual.diameterMm - target.diameterMm) / target.diameterMm;
  return depthDeviation > 0.1 || diameterDeviation > 0.05;
}

@Injectable()
export class DrilledHoleService {
  constructor(
    @InjectRepository(DrilledHole)
    private readonly repo: Repository<DrilledHole>,
    @InjectRepository(DrillingPlan)
    private readonly planRepo: Repository<DrillingPlan>,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Append a drilled hole. Server-side append-only enforcement; corrections
   * land as NEW rows with `corrects_hole_id`. Out-of-tolerance is RECORDED
   * (tolerance_violation=true) but NOT BLOCKED (D2-12 — confirmation client-side).
   */
  async append(input: CreateDrilledHoleInput): Promise<DrilledHole> {
    const plan = await this.planRepo.findOne({
      where: { id: input.planId, tenantId: input.tenantId },
    });
    if (!plan) throw new NotFoundException(`DrillingPlan ${input.planId} not found`);
    if (plan.status !== 'active') {
      throw new BadRequestException({
        code: 'PLAN_NOT_ACTIVE',
        message: `Plan is '${plan.status}'; only active plans accept hole entries`,
      });
    }

    const toleranceViolation = computeToleranceViolation(
      { depthM: Number(plan.targetDepthM), diameterMm: plan.diameterMm },
      { depthM: input.actualDepthM, diameterMm: input.actualDiameterMm },
    );

    if (toleranceViolation && !input.toleranceViolationReason) {
      // Mobile MUST send a reason if it triggered tolerance modal.
      throw new BadRequestException({
        code: 'TOLERANCE_REASON_REQUIRED',
        message: 'Hole is out of tolerance — reason text required',
      });
    }

    const gpsPoint =
      input.gpsLatitude != null && input.gpsLongitude != null
        ? `SRID=4326;POINT(${input.gpsLongitude} ${input.gpsLatitude})`
        : null;

    const row = this.repo.create({
      tenantId: input.tenantId,
      siteId: input.siteId,
      planId: input.planId,
      holeIndexInPlan: input.holeIndexInPlan,
      gpsPoint,
      gpsAccuracyM:
        input.gpsAccuracyM != null ? input.gpsAccuracyM.toFixed(1) : null,
      actualDepthM: input.actualDepthM.toFixed(2),
      actualDiameterMm: input.actualDiameterMm,
      inclinationDeg:
        input.inclinationDeg != null ? input.inclinationDeg.toFixed(1) : null,
      startedAtLocal: input.startedAtLocal,
      endedAtLocal: input.endedAtLocal,
      ianaTimezone: input.ianaTimezone,
      operationalDayId: input.operationalDayId,
      operatorId: input.operatorId,
      machineId: input.machineId,
      fuelLitersConsumed:
        input.fuelLitersConsumed != null
          ? input.fuelLitersConsumed.toFixed(2)
          : null,
      notesText: input.notesText ?? null,
      photoBlobSha256: input.photoBlobSha256 ?? null,
      toleranceViolation,
      toleranceViolationReason: input.toleranceViolationReason ?? null,
      correctsHoleId: input.correctsHoleId ?? null,
      createdBy: input.createdBy,
    });

    const saved = await this.repo.save(row);

    // Emit event for yield recalculation handler (Task 2).
    this.events.emit('production.foration.hole_drilled', {
      tenantId: saved.tenantId,
      aggregateType: 'drilled_hole',
      aggregateId: saved.id,
      payload: {
        tenant_id: saved.tenantId,
        hole_id: saved.id,
        operational_day_id: saved.operationalDayId,
        machine_id: saved.machineId,
        operator_id: saved.operatorId,
      },
    });

    return saved;
  }

  async findByPlan(planId: string, tenantId: string): Promise<DrilledHole[]> {
    return this.repo.find({
      where: { planId, tenantId },
      order: { holeIndexInPlan: 'ASC' },
    });
  }

  async findById(id: string, tenantId: string): Promise<DrilledHole> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`DrilledHole ${id} not found`);
    return row;
  }
}
