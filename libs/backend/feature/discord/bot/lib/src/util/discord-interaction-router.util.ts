import {
  InteractionResponseType,
  MessageFlags,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APIInteraction,
  type APIInteractionResponse,
} from 'discord-api-types/v10';
import { t } from '../discord-i18n';
import {
  DiscordCustomIdValidationError,
  type DiscordCustomIdValidationFailure,
} from '../service/discord-custom-id.codec';

export type ComponentRenderMode = 'ephemeral' | 'update';

type ComponentRow = APIActionRowComponent<APIComponentInMessageActionRow>;

export function respond(
  mode: ComponentRenderMode,
  content: string,
  components: ComponentRow[] = [],
): APIInteractionResponse {
  return mode === 'update' ? update(content, components) : ephemeral(content, components);
}

export function ephemeral(content: string, components: ComponentRow[] = []): APIInteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content, flags: MessageFlags.Ephemeral, components },
  };
}

export function update(content: string, components: ComponentRow[] = []): APIInteractionResponse {
  return {
    type: InteractionResponseType.UpdateMessage,
    data: { content, components },
  };
}

export function componentValidationMessage(error: unknown, locale: string): string {
  const failure = error instanceof DiscordCustomIdValidationError ? error.failure : 'expired';
  return t(componentErrorKey(failure), locale);
}

function componentErrorKey(
  failure: DiscordCustomIdValidationFailure,
):
  | 'bot.error.expired'
  | 'bot.error.tampered'
  | 'bot.error.wrongOwner'
  | 'bot.error.wrongGuild'
  | 'bot.error.wrongTenant' {
  switch (failure) {
    case 'tampered':
      return 'bot.error.tampered';
    case 'wrong-owner':
      return 'bot.error.wrongOwner';
    case 'wrong-guild':
      return 'bot.error.wrongGuild';
    case 'wrong-tenant':
      return 'bot.error.wrongTenant';
    case 'expired':
      return 'bot.error.expired';
  }
}

export function interactionUser(interaction: APIInteraction): { id: string } {
  const maybeInteraction = interaction as {
    user?: { id: string };
    member?: { user?: { id: string } };
  };
  const user = maybeInteraction.user ?? maybeInteraction.member?.user;
  if (!user) {
    throw new Error('Discord interaction user missing.');
  }
  return user;
}
