import { UiStatCard } from "@app/frontend-ui";
import type { ComponentProps } from "react";

type LandingStatCardProps = ComponentProps<typeof UiStatCard>;

export const LandingStatCard = (props: LandingStatCardProps) => (
  <UiStatCard {...props} />
);
