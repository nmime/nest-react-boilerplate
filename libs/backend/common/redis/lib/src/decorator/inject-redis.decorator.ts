import { Inject } from "@nestjs/common";
import { RedisInjectToken } from "../const";

export const InjectRedis = (): ParameterDecorator => Inject(RedisInjectToken);
