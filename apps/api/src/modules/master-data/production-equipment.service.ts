import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EquipmentStatus,
  EquipmentType,
  ProductionEquipment,
} from './production-equipment.entity';

export interface CreateEquipmentInput {
  tenantId: string;
  siteId: string;
  code: string;
  label: string;
  type: EquipmentType;
  specs?: Record<string, unknown>;
}

export interface UpdateEquipmentInput {
  label?: string;
  specs?: Record<string, unknown>;
}

@Injectable()
export class ProductionEquipmentService {
  constructor(
    @InjectRepository(ProductionEquipment)
    private readonly repo: Repository<ProductionEquipment>,
  ) {}

  async create(input: CreateEquipmentInput): Promise<ProductionEquipment> {
    const row = this.repo.create({
      tenantId: input.tenantId,
      siteId: input.siteId,
      code: input.code,
      label: input.label,
      type: input.type,
      status: 'active',
      specs: input.specs ?? {},
    });
    return this.repo.save(row);
  }

  async findAll(tenantId: string, siteId?: string): Promise<ProductionEquipment[]> {
    const where: Record<string, unknown> = { tenantId };
    if (siteId) where.siteId = siteId;
    return this.repo.find({ where, order: { code: 'ASC' } });
  }

  async findById(id: string, tenantId: string): Promise<ProductionEquipment> {
    const row = await this.repo.findOne({ where: { id, tenantId } });
    if (!row) throw new NotFoundException(`Equipment ${id} not found`);
    return row;
  }

  async update(
    id: string,
    tenantId: string,
    input: UpdateEquipmentInput,
  ): Promise<ProductionEquipment> {
    const row = await this.findById(id, tenantId);
    if (input.label !== undefined) row.label = input.label;
    if (input.specs !== undefined) row.specs = input.specs;
    return this.repo.save(row);
  }

  async setStatus(
    id: string,
    tenantId: string,
    status: EquipmentStatus,
  ): Promise<ProductionEquipment> {
    const row = await this.findById(id, tenantId);
    row.status = status;
    return this.repo.save(row);
  }

  /**
   * Guard hook used by W1 foration (DrillingPlanService.assignMachine).
   * Throws when the equipment is not currently `active`.
   * Per D2-14: panne bloque affectation plan.
   */
  async assertActive(id: string, tenantId: string): Promise<void> {
    const row = await this.findById(id, tenantId);
    if (row.status !== 'active') {
      throw new BadRequestException({
        code: 'EQUIPMENT_NOT_ACTIVE',
        message: `Equipment ${row.code} is currently '${row.status}'`,
      });
    }
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const row = await this.findById(id, tenantId);
    await this.repo.delete({ id: row.id });
  }
}
