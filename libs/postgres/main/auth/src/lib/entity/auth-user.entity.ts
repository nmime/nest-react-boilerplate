import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export interface AuthUserEntityInput {
  email: string;
  displayName?: string | null;
}

@Entity({ name: "auth_users" })
@Index("auth_users_email_key", ["email"], { unique: true })
export class AuthUserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 320 })
  email!: string;

  @Column({
    name: "display_name",
    type: "varchar",
    length: 160,
    nullable: true,
  })
  displayName!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;

  constructor(input?: AuthUserEntityInput) {
    if (input) {
      this.email = input.email;
      this.displayName = input.displayName ?? null;
    }
  }
}
