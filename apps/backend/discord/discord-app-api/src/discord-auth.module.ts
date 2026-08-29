import { Module } from '@nestjs/common';
import { AuthMainModule } from '@app/backend-feature-auth-main';
import { DiscordAppApiCapabilitiesModule } from './capabilities.generated';

/**
 * Composes generated persistence providers inside the auth feature's dynamic
 * module scope. A sibling import in DiscordAppApiModule is not visible to
 * AuthMainModule's own providers, so the host passes the generated capability
 * module directly to AuthMainModule.forRoot().
 */
@Module({
  imports: [AuthMainModule.forRoot({ imports: [DiscordAppApiCapabilitiesModule] })],
  exports: [AuthMainModule],
})
export class DiscordAuthModule {}
