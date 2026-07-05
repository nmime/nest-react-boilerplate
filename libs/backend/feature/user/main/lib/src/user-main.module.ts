import { Module } from "@nestjs/common";
import { GetCurrentUserProfileUseCase } from "@app/backend-feature-user-shared";
import { ProfileController } from "./interfaces/http";

@Module({
  controllers: [ProfileController],
  providers: [GetCurrentUserProfileUseCase],
})
export class UserMainModule {}
