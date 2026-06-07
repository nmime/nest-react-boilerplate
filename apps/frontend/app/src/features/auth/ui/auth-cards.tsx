import type { TranslationKey, TranslationParams } from "@app/common/i18n";
import type { SubmitEvent } from "react";
import { UiButton, UiCard, UiForm, UiTextField } from "../../../shared/ui";
import type { AuthMode } from "../model";

export interface AuthCardsProps {
  isLoginPending: boolean;
  isRegisterPending: boolean;
  loadingLabel: string;
  onSubmit: (mode: AuthMode, event: SubmitEvent<HTMLFormElement>) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

export function AuthCards({
  isLoginPending,
  isRegisterPending,
  loadingLabel,
  onSubmit,
  t,
}: Readonly<AuthCardsProps>) {
  return (
    <>
      <UiCard title={t("user.login.title")}>
        <UiForm onSubmit={(event) => onSubmit("login", event)}>
          <UiTextField
            aria-label={t("user.form.loginEmailLabel")}
            autoComplete="email"
            label={t("user.form.email")}
            name="email"
            placeholder={t("user.form.emailPlaceholder")}
            required
            type="email"
          />
          <UiTextField
            aria-label={t("user.form.loginPasswordLabel")}
            autoComplete="current-password"
            label={t("user.form.password")}
            minLength={8}
            name="password"
            placeholder={t("user.form.loginPasswordPlaceholder")}
            required
            type="password"
          />
          <UiButton
            isLoading={isLoginPending}
            loadingLabel={loadingLabel}
            type="submit"
          >
            {t("user.form.login")}
          </UiButton>
        </UiForm>
      </UiCard>
      <UiCard title={t("user.register.title")}>
        <UiForm onSubmit={(event) => onSubmit("register", event)}>
          <UiTextField
            aria-label={t("user.form.registerDisplayNameLabel")}
            label={t("user.form.displayName")}
            name="displayName"
            placeholder={t("user.form.displayName")}
          />
          <UiTextField
            aria-label={t("user.form.registerEmailLabel")}
            autoComplete="email"
            label={t("user.form.email")}
            name="email"
            placeholder={t("user.form.registerEmailPlaceholder")}
            required
            type="email"
          />
          <UiTextField
            aria-label={t("user.form.registerPasswordLabel")}
            autoComplete="new-password"
            label={t("user.form.password")}
            minLength={8}
            name="password"
            placeholder={t("user.form.registerPasswordPlaceholder")}
            required
            type="password"
          />
          <UiButton
            isLoading={isRegisterPending}
            loadingLabel={loadingLabel}
            type="submit"
          >
            {t("user.form.register")}
          </UiButton>
        </UiForm>
      </UiCard>
    </>
  );
}
