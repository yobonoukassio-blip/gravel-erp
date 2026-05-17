import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditChainVerifier } from './audit-chain.verifier';
import { AuditExportService } from './audit-export.service';
import { AuditExportController } from './audit-export.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditExportController],
  providers: [AuditChainVerifier, AuditExportService],
  exports: [AuditChainVerifier, AuditExportService, TypeOrmModule],
})
export class AuditModule {}
