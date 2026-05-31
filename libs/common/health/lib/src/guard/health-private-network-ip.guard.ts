import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import {
  isRequestFromPrivateNetwork,
  type RequestWithClientAddress,
} from "@app/common/network";

@Injectable()
export class HealthPrivateNetworkIpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithClientAddress>();
    return isRequestFromPrivateNetwork(request);
  }
}
