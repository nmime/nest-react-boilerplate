import type { adminApi } from "@app/frontend/api-client";
import {
  UiEmptyState,
  UiLoading,
  UiResourceError,
  UiStatusTag,
  type TranslationKey,
  type TranslationParams,
} from "@app/frontend/ui";
import { errorText, join, statusLabelKey, statusTone } from "../../../shared";

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
    <div className="admin-user-detail">
      <div className="admin-user-detail__header">
        <strong>{detail.data.email}</strong>
        <UiStatusTag
          label={t(statusLabelKey[detail.data.status])}
          tone={statusTone[detail.data.status]}
        />
      </div>
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
          <dd className="admin-chip-row">
            {detail.data.permissions.length
              ? detail.data.permissions.map((permission) => (
                  <span className="admin-chip" key={permission}>
                    {permission}
                  </span>
                ))
              : join(detail.data.permissions)}
          </dd>
        </div>
      </dl>
    </div>
  );
};
