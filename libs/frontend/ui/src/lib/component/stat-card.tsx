export interface UiStatCardProps {
  label: string;
  value: string;
  detail: string;
}

export const UiStatCard = ({
  label,
  value,
  detail,
}: Readonly<UiStatCardProps>) => (
  <div className="xr-stat-card">
    <span>{label}</span>
    <strong>{value}</strong>
    <p>{detail}</p>
  </div>
);
