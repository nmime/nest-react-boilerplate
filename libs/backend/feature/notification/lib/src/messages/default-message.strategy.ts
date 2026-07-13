import { Logger } from '@nestjs/common';
import format from 'string-format';
import { Eta } from 'eta';
import type {
  NotificationData,
  NotificationDataValue,
  NotificationEntity,
  NotificationMessageButton,
  NotificationTemplateChannelEntity,
  NotificationTemplateEngine,
  NotificationTemplateEntity,
} from '@app/backend-postgres-main-notification';
import type { MassSenderMessage } from '../strategy/transport';
import { BaseMessageStrategy } from './base-message.strategy';

const DEFAULT_LANGUAGE = 'en';

export class DefaultMessageStrategy extends BaseMessageStrategy {
  private readonly logger = new Logger(DefaultMessageStrategy.name);

  constructor(private readonly notification: NotificationEntity) {
    super();
  }

  getMessage(language?: string): MassSenderMessage | undefined {
    const template = this.notification.template;
    if (!template) {
      return undefined;
    }

    const resolved = this.resolveBotContent(template);
    if (!resolved) {
      return undefined;
    }

    const { content, engine } = resolved;
    const data = this.notification.data as NotificationData | undefined;

    const text = this.renderString({ template: content.body, language, data, useFormat: true, templateEngine: engine });
    if (!text) {
      return undefined;
    }

    const image = this.renderString({ template: content.image, language, data, useFormat: false, templateEngine: engine });

    const buttons = this.renderButtons({
      template: content.buttons as Record<string, NotificationMessageButton[][]> | null | undefined,
      language,
      data,
      templateEngine: engine,
    });

    return { image, text, buttons };
  }

  private resolveBotContent(
    template: NotificationTemplateEntity,
  ): { content: { body: Record<string, string>; image?: Record<string, string>; buttons?: Record<string, unknown> }; engine: NotificationTemplateEngine } | undefined {
    const botChannel = template.botChannel as NotificationTemplateChannelEntity | undefined;
    if (botChannel) {
      const channelContent = botChannel.botContent();
      if (channelContent) {
        return { content: { body: channelContent.body, image: channelContent.image, buttons: channelContent.buttons as Record<string, unknown> | undefined }, engine: botChannel.engine };
      }
    }

    if (!template.body) {
      return undefined;
    }

    return {
      content: { body: template.body, image: template.image ?? undefined, buttons: (template.buttons as Record<string, unknown>) ?? undefined },
      engine: template.templateEngine,
    };
  }

  private prepareData(data: NotificationData, language?: string): NotificationData {
    const result: Record<string, NotificationDataValue> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const obj = value as Record<string, NotificationDataValue>;
        const hasLangKey = Object.keys(obj).find((k) => k === DEFAULT_LANGUAGE || k === 'default');
        if (hasLangKey) {
          result[key] = obj[language ?? ''] ?? obj[DEFAULT_LANGUAGE] ?? obj['default'] ?? Object.values(obj)[0];
        } else {
          result[key] = this.prepareData(obj, language);
        }
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private renderString(params: { template: Record<string, string> | null | undefined; language?: string; data?: NotificationData; useFormat: boolean; templateEngine: NotificationTemplateEngine }): string | undefined {
    const { template, language, data, useFormat = true, templateEngine } = params;
    if (!template) return undefined;

    const value = template[language ?? ''] ?? template[DEFAULT_LANGUAGE] ?? template['default'];
    if (!value) return undefined;

    if (useFormat && data) {
      const preparedData = this.prepareData(data, language);
      return this.format(value, preparedData, templateEngine);
    }
    return value;
  }

  private renderButtons(params: { template: Record<string, NotificationMessageButton[][]> | null | undefined; language?: string; data?: NotificationData; templateEngine: NotificationTemplateEngine }): NotificationMessageButton[][] | undefined {
    const { template, language, data, templateEngine } = params;
    if (!template) return undefined;

    const value = template[language ?? ''] ?? template[DEFAULT_LANGUAGE] ?? template['default'];
    if (!value) return undefined;

    return value.map((row) =>
      row.map((button) => ({
        text: data ? (this.format(button.text, data, templateEngine) ?? button.text) : button.text,
        callback: data && button.callback ? this.format(button.callback, data, templateEngine) : button.callback,
        webApp: data && button.webApp ? this.format(button.webApp, data, templateEngine) : button.webApp,
        url: data && button.url ? this.format(button.url, data, templateEngine) : button.url,
        switchInlineQuery: data && button.switchInlineQuery !== undefined ? this.format(button.switchInlineQuery, data, templateEngine) : button.switchInlineQuery,
        iconCustomEmojiId: button.iconCustomEmojiId,
      })),
    );
  }

  private format(template: string, data: NotificationData, templateEngine: NotificationTemplateEngine): string | undefined {
    try {
      if (templateEngine === NotificationTemplateEngine.Eta) {
        const eta = new Eta({ useWith: true, autoEscape: false });
        return eta.renderString(template, data);
      }
      if (templateEngine === NotificationTemplateEngine.StringFormat) {
        return format(template, data);
      }
      this.logger.error('Unknown template engine', { template, data, templateEngine });
      return undefined;
    } catch (error: unknown) {
      this.logger.error('Template engine error', error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }
}
