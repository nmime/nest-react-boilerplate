import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AuditLogAdminController } from './audit-log-admin.controller';
import { AuditLogAdminApiModule, AuditLogAdminModule } from './audit-log-admin.module';
import { AuditLogAdminService } from './audit-log-admin.service';

describe('audit log admin modules', () => {
  it('separates the reusable audit writer from the read-only HTTP surface', () => {
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuditLogAdminModule)).toContain(AuditLogAdminService);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, AuditLogAdminModule)).toContain(AuditLogAdminService);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AuditLogAdminApiModule)).toContain(AuditLogAdminController);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AuditLogAdminApiModule)).toContain(AuditLogAdminModule);
  });
});
