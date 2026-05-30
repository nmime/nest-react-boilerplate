import {
  Controller,
  Get,
  type INestApplication,
  NestMiddleware,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import supertest from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
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

const principal: AuthenticatedPrincipal = {
  subject: "decorated-user-id",
  roles: ["admin"],
  permissions: ["profile:read"],
};

class PrincipalMiddleware implements NestMiddleware {
  use(
    request: AuthenticatedRequest & { url?: string },
    _response: unknown,
    next: () => void,
  ): void {
    if (request.url === "/decorated-auth") {
      request.auth = principal;
    } else {
      request.user = principal;
    }
    next();
  }
}

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
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DecoratedController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(
      (
        request: AuthenticatedRequest & { url?: string },
        response: unknown,
        next: () => void,
      ) => {
        new PrincipalMiddleware().use(request, response, next);
      },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("injects the current principal and applies metadata decorators", async () => {
    const httpServer = app.getHttpAdapter().getInstance() as Parameters<
      typeof supertest
    >[0];

    await supertest(httpServer)
      .get("/decorated-user")
      .expect(200)
      .expect({ principal });
    await supertest(httpServer)
      .get("/decorated-auth")
      .expect(200)
      .expect({ principal });
  });
});
