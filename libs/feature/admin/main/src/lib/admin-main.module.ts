import { Module } from "@nestjs/common";
import { AdminProfileController } from "./admin-profile.controller";

@Module({
  controllers: [AdminProfileController],
})
export class AdminMainModule {}
