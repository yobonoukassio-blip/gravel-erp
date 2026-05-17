import { Body, Controller, HttpCode, HttpStatus, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { User } from './entities/user.entity';
import { Public } from '../../common/guards/jwt-auth.guard';

interface LoginBody {
  email?: string;
  password?: string;
}

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    tenantId: string;
    siteIds: string[];
    groupScope: 'group' | null;
    preferredLocale: string;
  };
}

/**
 * Local email/password authentication for demo deployments. Coexists with the
 * Keycloak SSO path: any user with a non-null password_hash can log in here.
 * Returns an HS256 JWT signed with AUTH_JWT_SECRET that JwtAuthGuard's local
 * branch (see common/guards/jwt-auth.guard.ts) accepts in addition to RS256
 * Keycloak tokens.
 */
@Controller('auth')
export class AuthController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginBody): Promise<LoginResponse> {
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    if (!email || !password) {
      throw new UnauthorizedException({ code: 'ERR_AUTH_CREDENTIALS_MISSING' });
    }

    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = :email', { email })
      .andWhere('u.passwordHash IS NOT NULL')
      .andWhere('u.archivedAt IS NULL')
      .getOne();

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException({ code: 'ERR_AUTH_INVALID_CREDENTIALS' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ code: 'ERR_AUTH_INVALID_CREDENTIALS' });
    }

    await this.users.update({ id: user.id }, { lastLoginAt: new Date() });

    const secret = this.config.getOrThrow<string>('AUTH_JWT_SECRET');
    const accessToken = jwt.sign(
      {
        sub: user.id,
        tenant_id: user.tenantId,
        site_ids: user.siteIds,
        role: user.role,
        group_scope: user.groupScope,
        preferred_locale: user.preferredLocale,
        email: user.email,
      },
      secret,
      { algorithm: 'HS256', expiresIn: '12h', issuer: 'gravel-local-auth' },
    );

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        tenantId: user.tenantId,
        siteIds: user.siteIds,
        groupScope: user.groupScope,
        preferredLocale: user.preferredLocale,
      },
    };
  }
}
