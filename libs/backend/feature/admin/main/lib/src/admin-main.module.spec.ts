import { Test, type TestingModule } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { AdminProfileController } from "./interfaces/http/admin-profile.controller";
import { AdminMainModule } from "./admin-main.module";

describe("AdminMainModule", () => {
  it("wires the admin profile controller", async () => {
    let moduleRef: TestingModule | undefined;

    try {
      moduleRef = await Test.createTestingModule({
        imports: [AdminMainModule],
      }).compile();

      expect(
        moduleRef.get<AdminProfileController>(AdminProfileController),
      ).toBeInstanceOf(AdminProfileController);
    } finally {
      await moduleRef?.close();
    }
  });
});
