import { beforeEach, describe, expect, it, vi } from "vitest";
import { S3ConfigService } from "./s3.config.service";

describe("S3ConfigService", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses explicit config before environment values", () => {
    vi.stubEnv("S3_ENDPOINT", "https://env-s3.example.com");
    vi.stubEnv("S3_REGION", "eu-west-1");
    vi.stubEnv("S3_BUCKET", "env-bucket");

    const service = new S3ConfigService({
      endpoint: "https://configured-s3.example.com",
      region: "us-east-1",
      bucket: "configured-bucket",
    });

    expect(service.endpoint).toBe("https://configured-s3.example.com");
    expect(service.region).toBe("us-east-1");
    expect(service.bucket).toBe("configured-bucket");
  });

  it("reads optional values from environment through createConfig", () => {
    vi.stubEnv("S3_ENDPOINT", "https://env-s3.example.com");
    vi.stubEnv("S3_REGION", "eu-west-1");
    vi.stubEnv("S3_BUCKET", "env-bucket");

    const service = new S3ConfigService();

    expect(service.endpoint).toBe("https://env-s3.example.com");
    expect(service.region).toBe("eu-west-1");
    expect(service.bucket).toBe("env-bucket");
  });
});
