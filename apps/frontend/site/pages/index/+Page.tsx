import { useI18n } from "@app/frontend-runtime";

export function Page() {
  const { t } = useI18n();

  return (
    <section className="site-home">
      <p className="site-kicker">{t("user.eyebrow")}</p>
      <h1>{t("user.title")}</h1>
      <p>{t("user.description")}</p>
    </section>
  );
}
