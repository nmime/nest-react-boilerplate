import { Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";

interface RobotsRequestLike {
  method?: string;
  path?: string;
  url?: string;
}

interface RobotsResponseLike {
  type?(contentType: string): RobotsResponseLike;
  send?(body: string): unknown;
  setHeader?(name: string, value: string): unknown;
  end?(body: string): unknown;
}

@Injectable()
export class RobotsMiddleware implements NestMiddleware {
  use(
    request: RobotsRequestLike,
    response: RobotsResponseLike,
    next: () => void,
  ): void {
    if (
      request.method === "GET" &&
      (request.path ?? request.url) === "/robots.txt"
    ) {
      response.type?.("text/plain");
      response.setHeader?.("content-type", "text/plain");
      if (response.send) {
        response.send("User-agent: *\nDisallow: /\n");
      } else {
        response.end?.("User-agent: *\nDisallow: /\n");
      }
      return;
    }

    next();
  }
}

export function robotsMiddleware() {
  const middleware = new RobotsMiddleware();
  return middleware.use.bind(middleware);
}
