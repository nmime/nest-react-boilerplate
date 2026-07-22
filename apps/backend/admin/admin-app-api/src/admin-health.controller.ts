import { Controller } from '@nestjs/common';
import { BaseHealthController } from '@app/backend-common-health';

/** Same-origin admin UI alias. The root health endpoints remain available for
 * platform probes, while the namespaced routes pass through the admin SPA's
 * existing `/admin/` reverse-proxy boundary. */
@Controller('admin')
export class AdminHealthController extends BaseHealthController {}
