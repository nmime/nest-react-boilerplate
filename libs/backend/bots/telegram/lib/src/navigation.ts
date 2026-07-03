import type { TelegramBotContext, TelegramBotRoute } from "./types";

const maxStackDepth = 8;

export function navigateTo(
  ctx: TelegramBotContext,
  route: TelegramBotRoute,
  params: Record<string, string> = {},
): void {
  const stack: TelegramBotRoute[] = ctx.session.stack.length
    ? ctx.session.stack
    : ["main"];
  const current = ctx.session.currentRoute;
  ctx.session.currentRoute = route;
  ctx.session.params = params;
  ctx.session.lastMenuId = menuIdForRoute(route);

  if (current !== route) {
    ctx.session.stack = [...stack, route].slice(-maxStackDepth);
  }
}

export function goBack(ctx: TelegramBotContext): TelegramBotRoute {
  const stack: TelegramBotRoute[] = ctx.session.stack.length
    ? [...ctx.session.stack]
    : ["main"];
  if (stack.length > 1) {
    stack.pop();
  }

  const route: TelegramBotRoute = stack[stack.length - 1] ?? "main";
  ctx.session.stack = stack;
  ctx.session.currentRoute = route;
  ctx.session.params = {};
  ctx.session.lastMenuId = menuIdForRoute(route);
  return route;
}

export function goHome(ctx: TelegramBotContext): void {
  ctx.session.currentRoute = "main";
  ctx.session.stack = ["main"];
  ctx.session.params = {};
  ctx.session.lastMenuId = menuIdForRoute("main");
}

export function menuIdForRoute(route: TelegramBotRoute): string {
  if (route.startsWith("settings.language")) {
    return "telegram:menu:language";
  }

  if (route.startsWith("support")) {
    return "telegram:menu:support";
  }

  if (route.startsWith("link")) {
    return "telegram:menu:link";
  }

  if (route === "settings") {
    return "telegram:menu:settings";
  }

  if (route === "profile") {
    return "telegram:menu:profile";
  }

  return "telegram:menu:main";
}
