import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  EpiAssignment,
  EpiCondition,
} from '../entities/epi-assignment.entity';
import { EpiCategory, EpiItem } from '../entities/epi-item.entity';

export interface IssueEpiInput {
  tenantId: string;
  employeeId: string;
  epiItemId: string;
  issuedBy: string;
  issuedAtUtc?: Date;
  notes?: string | null;
}

export interface ReturnEpiInput {
  tenantId: string;
  assignmentId: string;
  returnedBy: string;
  returnedAtUtc?: Date;
  condition?: EpiCondition; // default 'good'
}

export interface EpiComplianceRow {
  employeeId: string;
  missingCategories: readonly EpiCategory[];
  missingItemNames: readonly string[];
}

/**
 * EpiService (HSE-03).
 *
 * Manages EPI catalog + per-employee issuance. Append-style writes only —
 * a "return" or "condemn" fills returned_at_utc/returned_by on the original
 * row but never deletes. To re-issue, callers INSERT a new assignment.
 */
@Injectable()
export class EpiService {
  private readonly logger = new Logger(EpiService.name);

  constructor(
    @InjectRepository(EpiItem)
    private readonly items: Repository<EpiItem>,
    @InjectRepository(EpiAssignment)
    private readonly assignments: Repository<EpiAssignment>,
  ) {}

  // ----- Catalog -----

  async listItems(tenantId: string): Promise<EpiItem[]> {
    return this.items.find({
      where: { tenantId },
      order: { isMandatory: 'DESC', category: 'ASC', name: 'ASC' },
    });
  }

  async createItem(input: {
    tenantId: string;
    name: string;
    category: EpiCategory;
    description?: string | null;
    isMandatory?: boolean;
  }): Promise<EpiItem> {
    if (!input.name?.trim()) {
      throw new BadRequestException('EPI item name is required');
    }
    const item = this.items.create({
      tenantId: input.tenantId,
      name: input.name.trim(),
      category: input.category,
      description: input.description ?? null,
      isMandatory: input.isMandatory ?? false,
    });
    return this.items.save(item);
  }

  // ----- Assignment lifecycle -----

  async issue(input: IssueEpiInput): Promise<EpiAssignment> {
    const item = await this.items.findOne({
      where: { id: input.epiItemId, tenantId: input.tenantId },
    });
    if (!item) {
      throw new NotFoundException(`EPI item ${input.epiItemId} not found`);
    }
    const row = this.assignments.create({
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      epiItemId: input.epiItemId,
      issuedBy: input.issuedBy,
      issuedAtUtc: input.issuedAtUtc ?? new Date(),
      returnedAtUtc: null,
      returnedBy: null,
      condition: 'good',
      notes: input.notes ?? null,
    });
    return this.assignments.save(row);
  }

  async return(input: ReturnEpiInput): Promise<EpiAssignment> {
    const row = await this.assignments.findOne({
      where: { id: input.assignmentId, tenantId: input.tenantId },
    });
    if (!row) {
      throw new NotFoundException(
        `EPI assignment ${input.assignmentId} not found`,
      );
    }
    if (row.returnedAtUtc !== null) {
      throw new BadRequestException('Assignment already returned');
    }
    row.returnedAtUtc = input.returnedAtUtc ?? new Date();
    row.returnedBy = input.returnedBy;
    row.condition = input.condition ?? 'good';
    return this.assignments.save(row);
  }

  /** List currently held EPI items for one employee. */
  async listOpenForEmployee(
    tenantId: string,
    employeeId: string,
  ): Promise<EpiAssignment[]> {
    return this.assignments.find({
      where: { tenantId, employeeId, returnedAtUtc: IsNull() },
      relations: ['epiItem'],
      order: { issuedAtUtc: 'DESC' },
    });
  }

  /**
   * HSE-03 compliance check: for the given employee list, returns any
   * employee missing one or more mandatory EPI items. Used by:
   *   - Site daily compliance dashboard
   *   - Pre-shift HSE check
   */
  async checkCompliance(
    tenantId: string,
    employeeIds: readonly string[],
  ): Promise<EpiComplianceRow[]> {
    if (employeeIds.length === 0) return [];

    const mandatoryItems = await this.items.find({
      where: { tenantId, isMandatory: true },
    });
    if (mandatoryItems.length === 0) return [];

    const mandatoryByCategory = new Map<EpiCategory, EpiItem[]>();
    for (const item of mandatoryItems) {
      const list = mandatoryByCategory.get(item.category) ?? [];
      list.push(item);
      mandatoryByCategory.set(item.category, list);
    }

    const open = await this.assignments.find({
      where: { tenantId, returnedAtUtc: IsNull() },
      relations: ['epiItem'],
    });

    const heldByEmployee = new Map<string, Set<EpiCategory>>();
    for (const row of open) {
      if (!employeeIds.includes(row.employeeId)) continue;
      if (row.condition === 'condemned') continue;
      const cat = row.epiItem?.category;
      if (!cat) continue;
      const set = heldByEmployee.get(row.employeeId) ?? new Set<EpiCategory>();
      set.add(cat);
      heldByEmployee.set(row.employeeId, set);
    }

    const out: EpiComplianceRow[] = [];
    for (const employeeId of employeeIds) {
      const held = heldByEmployee.get(employeeId) ?? new Set<EpiCategory>();
      const missing: EpiCategory[] = [];
      const missingNames: string[] = [];
      for (const [category, items] of mandatoryByCategory) {
        if (!held.has(category)) {
          missing.push(category);
          missingNames.push(...items.map((i) => i.name));
        }
      }
      if (missing.length > 0) {
        out.push({
          employeeId,
          missingCategories: missing,
          missingItemNames: missingNames,
        });
      }
    }
    return out;
  }
}
