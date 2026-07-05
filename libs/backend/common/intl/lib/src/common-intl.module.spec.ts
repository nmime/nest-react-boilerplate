import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { CommonIntlModule } from "./common-intl.module";

describe("CommonIntlModule", () => {
  it("compiles as a Nest module", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CommonIntlModule],
    }).compile();

    expect(moduleRef.get(CommonIntlModule)).toBeInstanceOf(CommonIntlModule);
  });
});
