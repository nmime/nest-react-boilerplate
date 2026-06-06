import { Inject } from "@nestjs/common";
import { NatsInjectToken } from "../const";

export const InjectNatsConnection = (): ParameterDecorator =>
  Inject(NatsInjectToken);
