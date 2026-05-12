import { BadRequestException, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  DeepPartial,
  EntityManager,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { CLS_KEYS } from '../cls/tenant-context';

/**
 * Defense layer 2: every repo access goes through this wrapper.
 *
 * Responsibilities:
 *  - Reject any operation without a CLS tenant context.
 *  - Inject `tenant_id` on save() when the entity lacks it.
 *  - Force-add `tenant_id = :tenantId` predicate to every queryBuilder.
 *
 * Even if a developer forgets to apply RLS in the DB (impossible because
 * migration enforces it), this layer catches it. Even if RLS is misconfigured,
 * this layer scopes queries. Two independent failsafes.
 */
@Injectable()
export class TenantAwareRepositoryFactory {
  constructor(
    private readonly entityManager: EntityManager,
    private readonly cls: ClsService,
  ) {}

  forEntity<T extends ObjectLiteral>(target: EntityTarget<T>): TenantAwareRepository<T> {
    return new TenantAwareRepository<T>(this.entityManager.getRepository(target), this.cls);
  }
}

export class TenantAwareRepository<T extends ObjectLiteral> {
  constructor(
    private readonly repo: Repository<T>,
    private readonly cls: ClsService,
  ) {}

  private requireTenantId(): string {
    const tenantId = this.cls.get<string>(CLS_KEYS.TENANT_ID);
    if (!tenantId) {
      throw new BadRequestException(
        'No tenant context. TenantAwareRepository requires CLS_KEYS.TENANT_ID — ' +
          'check that JWT guard / tenant middleware ran on this request.',
      );
    }
    return tenantId;
  }

  async find(options?: FindManyOptions<T>): Promise<T[]> {
    const tenantId = this.requireTenantId();
    return this.repo.find({
      ...options,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { ...(options?.where as any), tenantId },
    });
  }

  async findOne(options: FindOneOptions<T>): Promise<T | null> {
    const tenantId = this.requireTenantId();
    return this.repo.findOne({
      ...options,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      where: { ...(options.where as any), tenantId },
    });
  }

  async save(entity: DeepPartial<T>): Promise<T> {
    const tenantId = this.requireTenantId();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = entity as any;
    if (e.tenantId === undefined || e.tenantId === null) {
      e.tenantId = tenantId;
    } else if (e.tenantId !== tenantId) {
      throw new BadRequestException(
        `Cross-tenant save rejected: entity.tenantId=${String(e.tenantId)} but CLS tenantId=${tenantId}`,
      );
    }
    return this.repo.save(e);
  }

  createQueryBuilder(alias: string): SelectQueryBuilder<T> {
    const tenantId = this.requireTenantId();
    return this.repo.createQueryBuilder(alias).andWhere(`${alias}.tenantId = :__tenantId`, {
      __tenantId: tenantId,
    });
  }
}
