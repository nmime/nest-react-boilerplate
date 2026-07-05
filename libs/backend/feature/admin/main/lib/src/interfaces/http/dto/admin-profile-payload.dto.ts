import { ApiProperty } from "@nestjs/swagger";
import { AdminProfileViewDto } from "./admin-profile-view.dto";
import { AuthenticatedPrincipalDto } from "./authenticated-principal.dto";

export class AdminProfilePayloadDto {
  @ApiProperty({ type: () => AuthenticatedPrincipalDto })
  principal!: AuthenticatedPrincipalDto;

  @ApiProperty({ type: () => AdminProfileViewDto })
  profile!: AdminProfileViewDto;
}
