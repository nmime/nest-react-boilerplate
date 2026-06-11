import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { catchError, map, of, type Observable } from "rxjs";
import { BaseException, toProblemDetails } from "@app/common/exceptions";

export interface WebSocketResponse<T = unknown> {
  id: string | null;
  result?: T;
  error?: {
    code: string;
    message: string;
    data?: unknown;
  };
}

@Injectable()
export class WebSocketResponseTransformer implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<WebSocketResponse> {
    return next.handle().pipe(
      map((value: unknown) => this.handleSuccess(context, value)),
      catchError((error: unknown) => of(this.handleError(context, error))),
    );
  }

  private handleSuccess(
    context: ExecutionContext,
    result: unknown,
  ): WebSocketResponse {
    return {
      id: this.getRequestId(context),
      result: {
        ...(result && typeof result === "object" ? result : { value: result }),
        success: true,
      },
    };
  }

  private handleError(
    context: ExecutionContext,
    error: unknown,
  ): WebSocketResponse {
    const problem = toProblemDetails(error);
    return {
      id: this.getRequestId(context),
      error: {
        code:
          error instanceof BaseException || error instanceof HttpException
            ? (problem.code ?? "request-failed")
            : "internal-error",
        message: problem.detail ?? problem.title,
        data: problem,
      },
    };
  }

  private getRequestId(context: ExecutionContext): string | null {
    const data = context.switchToWs().getData<unknown>();
    if (!data || typeof data !== "object" || !("id" in data)) {
      return null;
    }

    return typeof data.id === "string" ? data.id : null;
  }
}
