import { Injectable } from "@nestjs/common";

@Injectable()
export class StaticDataConfigService {
  constructor(private readonly rootDir = process.env.STATIC_DATA_ROOT ?? ".") {}

  get dataRoot(): string {
    return this.rootDir;
  }
}
