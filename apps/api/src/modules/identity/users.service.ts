import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { User } from './entities/user.entity';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { CLS_KEYS } from '../../common/cls/tenant-context';

/**
 * Canonical user service. Owns `users` row writes including the
 * `preferred_locale` round-trip path (FND-09).
 *
 * RLS + TenantRlsSubscriber + audit_log triggers from W1-P02 are all active:
 *   - Every query auto-scopes to `tenant_id = current_setting('app.tenant_id')`.
 *   - Every write produces an `audit_log` row with chain-of-hash.
 *
 * We use the raw `Repository<User>` here (not TenantAwareRepository) because:
 *   - The `users` row identity is the JWT `sub`; we already filter by `id`.
 *   - RLS at the DB still enforces tenant isolation as a second layer.
 *   - The audit trigger fires regardless of which TypeORM API we call.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.ds.getRepository(User).findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<User> {
    const callerId = this.cls.get<string>(CLS_KEYS.USER_ID);
    if (!callerId) {
      throw new BadRequestException('No CLS user context');
    }
    // Path identifies caller from JWT only; defense-in-depth check.
    if (callerId !== userId) {
      throw new BadRequestException('updatePreferences only allowed on the calling user');
    }

    if (dto.key === 'locale') {
      await this.ds
        .getRepository(User)
        .update({ id: userId }, { preferredLocale: dto.value });
    } else {
      throw new BadRequestException(`Unknown preference key: ${dto.key as string}`);
    }
    return this.findById(userId);
  }
}
