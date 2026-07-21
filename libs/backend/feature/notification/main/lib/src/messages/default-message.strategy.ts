import { Logger } from '@nestjs/common';
import { Eta } from 'eta';
import format from 'string-format';
import {
  NotificationChannel,
  NotificationTemplateEngine,
  type NotificationBotChannelContent,
  type NotificationData,
  type NotificationDataValue,
  type NotificationDeliveryChannel,
  type NotificationEmailChannelContent,
  type NotificationMessageButton,
  type NotificationRecord,
} from '@app/common-notifications';
import type { NotificationRenderedMessage } from '../strategy/transport';
import { BaseMessageStrategy } from './base-message.strategy';

const defaultLanguage = 'en';

export class DefaultMessageStrategy extends BaseMessageStrategy {
  private readonly logger = new Logger(DefaultMessageStrategy.name);

  constructor(
    private readonly notification: NotificationRecord,
    private readonly channel: NotificationDeliveryChannel,
  ) {
    super();
  }

  getMessage(language?: string): NotificationRenderedMessage | undefined {
    const templateChannel = this.notification.template.channels[this.channel];
    if (!templateChannel) {
      return undefined;
    }

    const data = mergeNotificationData(this.notification.data, this.notification.sensitiveData);
    if (this.channel === NotificationChannel.Bot && isBotChannelContent(templateChannel.content)) {
      const content = templateChannel.content;
      const text = this.renderString({
        template: content.body,
        language,
        data,
        useFormat: true,
        templateEngine: templateChannel.engine,
      });
      if (!text) {
        return undefined;
      }
      const image = this.renderString({
        template: content.image,
        language,
        data,
        useFormat: false,
        templateEngine: templateChannel.engine,
      });
      const buttons = this.renderButtons({
        template: content.buttons,
        language,
        data,
        templateEngine: templateChannel.engine,
      });
      return { kind: 'bot', image, text, buttons };
    }

    if (this.channel === NotificationChannel.Email && isEmailChannelContent(templateChannel.content)) {
      const subject = this.renderString({
        template: templateChannel.content.subject,
        language,
        data,
        useFormat: true,
        templateEngine: templateChannel.engine,
      });
      const text = this.renderString({
        template: templateChannel.content.body,
        language,
        data,
        useFormat: true,
        templateEngine: templateChannel.engine,
      });
      return subject && text ? { kind: 'email', subject, text } : undefined;
    }

    return undefined;
  }

  private prepareData(data: NotificationData, language?: string): NotificationData {
    const result: Record<string, NotificationDataValue> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null) {
        const hasLanguageKey = [language, defaultLanguage, 'default'].some(
          (candidate) => candidate !== undefined && Object.hasOwn(value, candidate),
        );
        if (hasLanguageKey) {
          const localizedValue =
            value[language ?? ''] ?? value[defaultLanguage] ?? value['default'] ?? Object.values(value)[0];
          if (localizedValue !== undefined) {
            result[key] = localizedValue;
          }
        } else {
          result[key] = this.prepareData(value, language);
        }
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private renderString(params: {
    template: Record<string, string> | undefined;
    language?: string;
    data?: NotificationData;
    useFormat: boolean;
    templateEngine: NotificationTemplateEngine;
  }): string | undefined {
    const { template, language, data, useFormat, templateEngine } = params;
    const value = template?.[language ?? ''] ?? template?.[defaultLanguage] ?? template?.['default'];
    if (!value) {
      return undefined;
    }
    return useFormat && data ? this.format(value, this.prepareData(data, language), templateEngine) : value;
  }

  private renderButtons(params: {
    template: Record<string, NotificationMessageButton[][]> | undefined;
    language?: string;
    data?: NotificationData;
    templateEngine: NotificationTemplateEngine;
  }): NotificationMessageButton[][] | undefined {
    const { template, language, data, templateEngine } = params;
    const rows = template?.[language ?? ''] ?? template?.[defaultLanguage] ?? template?.['default'];
    if (!rows) {
      return undefined;
    }

    return rows.map((row) =>
      row.map((button) => ({
        text: data ? (this.format(button.text, data, templateEngine) ?? button.text) : button.text,
        callback: data && button.callback ? this.format(button.callback, data, templateEngine) : button.callback,
        webApp: data && button.webApp ? this.format(button.webApp, data, templateEngine) : button.webApp,
        url: data && button.url ? this.format(button.url, data, templateEngine) : button.url,
        switchInlineQuery:
          data && button.switchInlineQuery !== undefined
            ? this.format(button.switchInlineQuery, data, templateEngine)
            : button.switchInlineQuery,
        iconCustomEmojiId: button.iconCustomEmojiId,
      })),
    );
  }

  private format(
    template: string,
    data: NotificationData,
    templateEngine: NotificationTemplateEngine,
  ): string | undefined {
    try {
      if (templateEngine === NotificationTemplateEngine.Eta) {
        return new Eta({ useWith: true, autoEscape: false }).renderString(template, data);
      }
      return format(template, data);
    } catch (error: unknown) {
      this.logger.error('Notification template rendering failed', error instanceof Error ? error.message : error);
      return undefined;
    }
  }
}

function isBotChannelContent(value: unknown): value is NotificationBotChannelContent {
  return (
    isRecord(value) &&
    isLocalizedStrings(value['body']) &&
    (value['image'] === undefined || isLocalizedStrings(value['image']))
  );
}

function isEmailChannelContent(value: unknown): value is NotificationEmailChannelContent {
  return isRecord(value) && isLocalizedStrings(value['subject']) && isLocalizedStrings(value['body']);
}

function mergeNotificationData(
  data: NotificationData | null,
  sensitiveData: NotificationData | null,
): NotificationData | undefined {
  if (!data && !sensitiveData) {
    return undefined;
  }
  return { ...(data ?? {}), ...(sensitiveData ?? {}) };
}

function isLocalizedStrings(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
