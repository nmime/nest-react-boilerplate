import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "@app/backend-feature-auth-shared";
import { AdminApplicationError } from "../../application";
import {
  createAdminRequestContext,
  type AdminRequestContext,
} from "../../domain";
import { requestContext } from "@app/backend-common-bootstrap";

// Translate an application-layer error into the matching HTTP exception. Shared
// by every admin controller so the code -> status mapping stays in one place.
export const toHttpException = (error: unknown): never => {
  if (error instanceof AdminApplicationError) {
    if (error.code === "not_found") {
      throw new NotFoundException(error.message);
    }
    if (error.code === "conflict") {
      throw new ConflictException(error.message);
    }
    if (
      error.code === "invalid_access_policy" ||
      error.code === "sensitive_policy_violation"
    ) {
      throw new BadRequestException(error.message);
    }

    throw new InternalServerErrorException(error.message);
  }

  throw error;
};

export const executeAdminUseCase = async <T>(
  handler: () => Promise<T>,
): Promise<T> => {
  try {
    return await handler();
  } catch (error) {
    return toHttpException(error);
  }
};

export const requestContextFromRequest = (
  _request: AuthenticatedRequest,
): AdminRequestContext =>
  createAdminRequestContext({
    // Read from CLS — same requestId as filter, logger, services.
    // CLS interceptor runs before controllers, so requestId is always available.
    requestId: requestContext.getRequestId(),
  });
