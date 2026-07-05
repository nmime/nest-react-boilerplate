import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { S3Module } from "./s3.module";
import { S3Service } from "./s3.service";
import {
  InMemoryObjectStorageClient,
  ObjectStorageInjectToken,
  type ObjectStorageClient,
} from "./s3.storage";

describe("S3Module", () => {
  it("provides a default in-memory client when none is supplied", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [S3Module.forRoot()],
    }).compile();

    expect(moduleRef.get(ObjectStorageInjectToken)).toBeInstanceOf(
      InMemoryObjectStorageClient,
    );

    const service = moduleRef.get(S3Service);
    await service.putObject({ bucket: "b", key: "k", body: "v" });
    await expect(
      service.getObject({ bucket: "b", key: "k" }),
    ).resolves.toMatchObject({ key: "k" });
  });

  it("uses a supplied client", async () => {
    const client: ObjectStorageClient = new InMemoryObjectStorageClient();
    const moduleRef = await Test.createTestingModule({
      imports: [S3Module.forRoot({ client })],
    }).compile();

    expect(moduleRef.get(ObjectStorageInjectToken)).toBe(client);
  });
});
