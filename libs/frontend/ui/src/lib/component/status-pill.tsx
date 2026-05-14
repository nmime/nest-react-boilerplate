export interface UiStatusPillProps {
  label: string;
  tone?: "success" | "info" | "warning";
}

export const UiStatusPill = ({
  label,
  tone = "info",
}: Readonly<UiStatusPillProps>) => (
  <span className={`xr-status xr-status--${tone}`}>{label}</span>
);
