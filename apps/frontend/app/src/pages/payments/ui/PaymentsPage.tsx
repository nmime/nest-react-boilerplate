export interface PaymentsPageProps {
  title: string;
  description?: string;
}

export function PaymentsPage({ title, description }: PaymentsPageProps) {
  return (
    <main>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </main>
  );
}
