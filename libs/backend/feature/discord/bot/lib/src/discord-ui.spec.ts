import {
  ButtonStyle,
  ComponentType,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord-api-types/v10';
import { describe, expect, it } from 'vitest';
import { createButtonRow, customButton, linkButton, validateCommandLocalization } from './discord-ui';

const command = (value: unknown): RESTPostAPIChatInputApplicationCommandsJSONBody =>
  value as RESTPostAPIChatInputApplicationCommandsJSONBody;

describe('discord-ui builders', () => {
  it('clamps overlong button labels and builds a link/custom action row', () => {
    const clamped = customButton('component-id', 'x'.repeat(200));
    expect(clamped.label?.length).toBeLessThanOrEqual(80);
    expect(clamped.label?.endsWith('…')).toBe(true);

    const link = linkButton('Open', 'https://app.example.test');
    expect(link.style).toBe(ButtonStyle.Link);

    const row = createButtonRow([clamped, link]);
    expect(row.type).toBe(ComponentType.ActionRow);
    expect(row.components).toHaveLength(2);
  });

  it('rejects invalid command name and description localizations', () => {
    expect(() => {
      validateCommandLocalization(command({ name: 'BadName', description: 'ok' }));
    }).toThrow(/command name localization/u);
    expect(() => {
      validateCommandLocalization(command({ name: 'good', description: '' }));
    }).toThrow(/command description localization/u);
    expect(() => {
      validateCommandLocalization(
        command({
          name: 'good',
          description: 'ok',
          name_localizations: { ru: 'BadRu' },
        }),
      );
    }).toThrow(/command name localization/u);
    expect(() => {
      validateCommandLocalization(
        command({
          name: 'good',
          description: 'ok',
          options: [{ type: 1, name: 'sub', description: 'x'.repeat(200) }],
        }),
      );
    }).toThrow(/command description localization/u);
    expect(() => {
      validateCommandLocalization(
        command({
          name: 'good',
          description: 'ok',
          name_localizations: { ru: null },
          description_localizations: { ru: null },
        }),
      );
    }).not.toThrow();
  });
});
