import { Transform } from "class-transformer";
import { normalizeStringList } from "../shared";

export const StringToArray = (): PropertyDecorator =>
  Transform(({ value }) => normalizeStringList(value));
