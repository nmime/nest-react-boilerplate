import { randomUUID } from "node:crypto";
import { EntitySchema } from "@mikro-orm/core";

export interface AuthUserEntityInput {
  email: string;
  displayName?: string | null;
}

export class AuthUserEntity {
  id: string = randomUUID();
  email!: string;
  displayName: string | null = null;
  createdAt: Date = new Date();
  updatedAt: Date = new Date();

  constructor(input?: AuthUserEntityInput) {
    if (input) {
      this.email = input.email;
      this.displayName = input.displayName ?? null;
    }
  }
}

export const AuthUserEntitySchema = new EntitySchema<AuthUserEntity>({
  class: AuthUserEntity,
  tableName: "auth_users",
  properties: {
    id: { type: "uuid", primary: true },
    email: { type: "varchar", length: 320 },
    displayName: {
      type: "varchar",
      fieldName: "display_name",
      length: 160,
      nullable: true,
    },
    createdAt: {
      type: "timestamptz",
      fieldName: "created_at",
      onCreate: () => new Date(),
    },
    updatedAt: {
      type: "timestamptz",
      fieldName: "updated_at",
      onCreate: () => new Date(),
      onUpdate: () => new Date(),
    },
  },
  uniques: [{ name: "auth_users_email_key", properties: ["email"] }],
});
