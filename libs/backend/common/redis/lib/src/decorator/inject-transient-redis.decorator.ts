import { Inject } from "@nestjs/common";
import { RedisTransientInjectToken } from "../const";

export const InjectTransientRedis = (): ParameterDecorator =>
  Inject(RedisTransientInjectToken);
