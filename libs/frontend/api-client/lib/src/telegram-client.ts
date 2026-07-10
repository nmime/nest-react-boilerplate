import { customClient } from "better-auth/client/plugins";

export const telegramClient = customClient({
  id: "telegram",
  path: "/telegram",
  endpoints: {
    webLogin: {
      method: "POST",
      path: "/web-login",
      type: "json",
    },
    tmaLogin: {
      method: "POST",
      path: "/tma",
      type: "json",
    },
    botLink: {
      method: "POST",
      path: "/bot-link",
      type: "json",
    },
  },
}) as any;
