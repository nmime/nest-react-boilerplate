import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";

export interface AuthPermissionEntityInput {
  key: string;
  resource: string;
  action: string;
  description?: string;
}

export class AuthPermissionEntity {
  id: string = randomUUID();
  key!: string;
  resource!: string;
  action!: string;
  description = "";
  createdAt: Date = new Date();

  constructor(input?: AuthPermissionEntityInput) {
    if (input) {
      this.key = input.key;
      this.resource = input.resource;
      this.action = input.action;
      this.description = input.description ?? "";
    }
  }
}

export const AuthPermissionEntitySchema =
  new EntitySchema<AuthPermissionEntity>({
    class: AuthPermissionEntity,
    tableName: "auth_permissions",
    properties: {
      id: { type: "uuid", primary: true },
      key: { type: "varchar", length: 128 },
      resource: { type: "varchar", length: 64 },
      action: { type: "varchar", length: 64 },
      description: { type: "varchar", length: 512, default: "" },
      createdAt: {
        type: "timestamptz",
        fieldName: "created_at",
        onCreate: () => new Date(),
      },
    },
    uniques: [{ name: "uq__auth_permissions__key", properties: ["key"] }],
    indexes: [
      {
        name: "ix__auth_permissions__resource_action",
        properties: ["resource", "action"],
      },
    ],
  });
