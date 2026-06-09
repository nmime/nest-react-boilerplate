import { Inject } from "@nestjs/common";
import {
  NatsInjectToken,
  NatsJetStreamInjectToken,
  NatsJetStreamManagerInjectToken,
  NatsKvManagerInjectToken,
  NatsObjectStoreManagerInjectToken,
  NatsServiceManagerInjectToken,
} from "../const";

export const InjectNatsConnection = (): ParameterDecorator &
  PropertyDecorator => Inject(NatsInjectToken);

export const InjectNatsJetStream = (): ParameterDecorator & PropertyDecorator =>
  Inject(NatsJetStreamInjectToken);

export const InjectNatsJetStreamManager = (): ParameterDecorator &
  PropertyDecorator => Inject(NatsJetStreamManagerInjectToken);

export const InjectNatsKvManager = (): ParameterDecorator & PropertyDecorator =>
  Inject(NatsKvManagerInjectToken);

export const InjectNatsObjectStoreManager = (): ParameterDecorator &
  PropertyDecorator => Inject(NatsObjectStoreManagerInjectToken);

export const InjectNatsServiceManager = (): ParameterDecorator &
  PropertyDecorator => Inject(NatsServiceManagerInjectToken);
