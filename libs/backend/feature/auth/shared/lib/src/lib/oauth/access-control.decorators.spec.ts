import { Controller, Get } from "@nestjs/common";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CurrentUser,
  Public,
  RequirePermissions,
  RequireRoles,
} from "./access-control.decorators";
import type {
  AuthenticatedPrincipal,
  AuthenticatedRequest,
} from "./access-control.types";
import { DEFAULT_AUTH_TENANT_ID } from "./tenant-context";

const principal: AuthenticatedPrincipal = {
  subject: "decorated-user-id",
  tenantId: DEFAULT_AUTH_TENANT_ID,
  roles: ["admin"],
  permissions: ["profile:read"],
};

@Controller()
class DecoratedController {
  @Get("decorated-user")
  @Public()
  @RequireRoles("admin")
  @RequirePermissions("profile:read")
  currentUser(
    @CurrentUser() currentPrincipal: AuthenticatedPrincipal | undefined,
  ) {
    return { principal: currentPrincipal };
  }

  @Get("decorated-auth")
  currentAuth(
    @CurrentUser() currentPrincipal: AuthenticatedPrincipal | undefined,
  ) {
    return { principal: currentPrincipal };
  }
}

describe("access-control decorators", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DecoratedController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app
      .getHttpAdapter()
      .getInstance()
      .addHook("preHandler", (request, _, done) => {
        const authenticatedRequest = request as AuthenticatedRequest & {
          url?: string;
        };
        if (authenticatedRequest.url === "/decorated-auth") {
          authenticatedRequest.auth = principal;
        } else {
          authenticatedRequest.user = principal;
        }
        done();
      });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("injects the current principal and applies metadata decorators", async () => {
    const userResponse = await app.inject({
      method: "GET",
      url: "/decorated-user",
    });
    expect(userResponse.statusCode).toBe(200);
    expect(userResponse.json()).toEqual({ principal });

    const authResponse = await app.inject({
      method: "GET",
      url: "/decorated-auth",
    });
    expect(authResponse.statusCode).toBe(200);
    expect(authResponse.json()).toEqual({ principal });
  });
});
