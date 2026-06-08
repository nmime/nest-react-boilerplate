import type { AdminAccess, AdminProfilePayload } from "../../admin-session";

export type AdminProfileState =
  | { status: "loading" }
  | { status: "forbidden"; reason: string }
  | { status: "ready"; payload: AdminProfilePayload; access: AdminAccess };
