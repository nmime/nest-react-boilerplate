import { SetMetadata } from "@nestjs/common";

export const MaxObjectSizeMetadataKey = "app:max-object-size";
export const MaxObjectSize = (bytes: number): MethodDecorator =>
  SetMetadata(MaxObjectSizeMetadataKey, bytes);
