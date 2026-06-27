import { Module } from "@nestjs/common";
import { GetCurrentUserProfileUseCase } from "@app/backend/feature/user/shared";
import { ProfileController } from "./interfaces/http/profile.controller";

@Module({
  controllers: [ProfileController],
  providers: [GetCurrentUserProfileUseCase],
})
export class UserMainModule {}
