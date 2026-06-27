import type { adminApi } from "@app/frontend/api-client";
import type { TranslationKey, TranslationParams } from "@app/common/i18n";
import { UiEmptyState, UiLoading, UiResourceError } from "@app/frontend/ui";
import { errorText, join, statusLabelKey } from "../../../shared";

export const UserDetailCard = ({
  detail,
  t,
}: Readonly<{
  detail: {
    data?: adminApi.AdminUsersControllerGetUserData;
    error: unknown;
    isLoading: boolean;
  };
  t: (key: TranslationKey, params?: TranslationParams) => string;
}>) => {
  if (detail.isLoading) {
    return <UiLoading label={t("admin.users.detail.loading")} />;
  }
  if (detail.error) {
    return (
      <UiResourceError
        title={t("admin.users.error.detailRequestFailed")}
        description={errorText(
          detail.error,
          "admin.users.error.detailRequestFailed",
          t,
        )}
      />
    );
  }
  if (!detail.data) {
    return (
      <UiEmptyState
        title={t("admin.users.detail.emptyEyebrow")}
        description={t("admin.users.detail.emptyTitle")}
      />
    );
  }
  return (
    <dl className="xr-profile-list">
      <div>
        <dt>{t("admin.users.column.email")}</dt>
        <dd>{detail.data.email}</dd>
      </div>
      <div>
        <dt>{t("admin.users.column.status")}</dt>
        <dd>{t(statusLabelKey[detail.data.status])}</dd>
      </div>
      <div>
        <dt>{t("admin.users.column.roles")}</dt>
        <dd>{join(detail.data.roles)}</dd>
      </div>
      <div>
        <dt>{t("admin.users.filter.permission")}</dt>
        <dd>{join(detail.data.permissions)}</dd>
      </div>
    </dl>
  );
};
