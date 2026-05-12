import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditChainVerifier } from './audit-chain.verifier';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditChainVerifier],
  exports: [AuditChainVerifier, TypeOrmModule],
})
export class AuditModule {}
