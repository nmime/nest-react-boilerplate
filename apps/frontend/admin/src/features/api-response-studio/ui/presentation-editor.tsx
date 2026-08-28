import { useState } from 'react';
import {
  ProblemPresentationDisplays,
  ProblemPresentationSeverities,
  type ProblemPresentationDisplay,
  type ProblemPresentationSeverity,
} from '@app/common-problem-details';
import { useI18n } from '@app/frontend-runtime';
import { UiCheckbox, UiSelect, UiTextareaField } from '@app/frontend-ui-web';
import type { ApiResponseStudioPresentation, StudioLanguage } from '../model/types';

const arraysToText = (values: readonly string[]): string => values.join('\n');
const textToArrays = (value: string): string[] =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

export const PresentationEditor = ({
  disabled = false,
  initial,
  onChange,
}: Readonly<{
  disabled?: boolean;
  initial: ApiResponseStudioPresentation;
  onChange: (value: ApiResponseStudioPresentation) => void;
}>) => {
  const { t } = useI18n();
  const [draft, setDraft] = useState(initial);

  const commit = (next: ApiResponseStudioPresentation) => {
    setDraft(next);
    onChange(next);
  };
  const setLanguage = (language: StudioLanguage, value: string) => {
    commit({ ...draft, texts: { ...draft.texts, [language]: textToArrays(value) } });
  };

  return (
    <div className="admin-studio-editor">
      <div className="admin-studio-editor__pair">
        <UiSelect
          disabled={disabled}
          label={t('admin.apiResponseStudio.editor.display')}
          onValueChange={(display) => {
            commit({ ...draft, display: display as ProblemPresentationDisplay });
          }}
          options={ProblemPresentationDisplays.map((display) => ({
            label: t(`admin.apiResponseStudio.display.${display}`),
            value: display,
          }))}
          value={draft.display}
        />
        <UiSelect
          disabled={disabled}
          label={t('admin.apiResponseStudio.editor.severity')}
          onValueChange={(severity) => {
            commit({ ...draft, severity: severity as ProblemPresentationSeverity });
          }}
          options={ProblemPresentationSeverities.map((severity) => ({
            label: t(`admin.apiResponseStudio.severity.${severity}`),
            value: severity,
          }))}
          value={draft.severity}
        />
      </div>
      <div className="admin-studio-editor__flags">
        <UiCheckbox
          checked={draft.support}
          disabled={disabled}
          label={t('admin.apiResponseStudio.editor.support')}
          onCheckedChange={(checked) => {
            commit({ ...draft, support: checked === true });
          }}
        />
        <UiCheckbox
          checked={draft.figmaOnly}
          disabled={disabled}
          label={t('admin.apiResponseStudio.editor.figmaOnly')}
          onCheckedChange={(checked) => {
            commit({ ...draft, figmaOnly: checked === true });
          }}
        />
      </div>
      <UiTextareaField
        disabled={disabled}
        label={t('admin.apiResponseStudio.editor.customDescription')}
        maxLength={1000}
        onChange={(event) => {
          commit({ ...draft, customDescription: event.currentTarget.value });
        }}
        value={draft.customDescription}
      />
      <UiTextareaField
        disabled={disabled}
        label={t('admin.apiResponseStudio.editor.comments')}
        maxLength={2000}
        onChange={(event) => {
          commit({ ...draft, comments: event.currentTarget.value });
        }}
        value={draft.comments}
      />
      <div className="admin-studio-editor__languages">
        {(['en', 'ru', 'zh'] as const).map((language) => (
          <UiTextareaField
            disabled={disabled}
            hint={t('admin.apiResponseStudio.editor.textsHint')}
            key={language}
            label={t(`admin.apiResponseStudio.editor.texts.${language}`)}
            onChange={(event) => {
              setLanguage(language, event.currentTarget.value);
            }}
            value={arraysToText(draft.texts[language])}
          />
        ))}
      </div>
    </div>
  );
};
