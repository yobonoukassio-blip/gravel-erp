import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { User } from './entities/user.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantContextMiddleware } from '../../common/middleware/tenant-context.middleware';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RoleGuard } from './role.decorator';

/**
 * Identity module:
 *   - JwtStrategy (Keycloak JWKS, audience+issuer enforced)
 *   - Global JwtAuthGuard (skip via @Public() on /health/*)
 *   - TenantContextMiddleware mounted on every route (after passport)
 *   - UsersController: GET /api/users/me, PUT /api/users/me/preferences
 */
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [UsersController],
  providers: [
    JwtStrategy,
    UsersService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
  exports: [UsersService, TypeOrmModule],
})
export class IdentityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
