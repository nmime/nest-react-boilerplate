import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { ProfileController } from "./profile.controller";
import { UserMainModule } from "./user-main.module";

describe("UserMainModule", () => {
  it("wires the profile controller", async () => {
    let moduleRef: TestingModule | undefined;

    try {
      moduleRef = await Test.createTestingModule({
        imports: [UserMainModule],
      }).compile();

      expect(moduleRef.get(ProfileController)).toBeInstanceOf(
        ProfileController,
      );
    } finally {
      await moduleRef?.close();
    }
  });
});
