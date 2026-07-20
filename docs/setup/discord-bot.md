# Discord Bot Setup

## 1. Create a Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Set the name, then click "Create"
4. On **General Information**, copy the **Application ID** to `DISCORD_APPLICATION_ID` and the **Public Key** to `DISCORD_PUBLIC_KEY`

## 2. Bot Token

1. Go to **Bot** → **Reset Token** → **Confirm**
2. Copy the token to `DISCORD_BOT_TOKEN` in your .env

## 3. OAuth2 Setup

1. Go to **OAuth2** → scroll to **Client Secret** → **Reset Secret** → copy to `DISCORD_CLIENT_SECRET`
2. Copy the **Client ID** to `DISCORD_CLIENT_ID`
3. Under **Redirects**, add: `http://localhost:3003/auth/discord/callback` (local dev, targets the auth-app-api service) or your production URL
4. Set `DISCORD_REDIRECT_URI` to match

## 4. Intents

Enable these in **Bot** → **Privileged Gateway Intents**:

- Message Content
- Server Members

## 5. Environment Variables

| Variable               | Required | Description                                    |
| ---------------------- | -------- | ---------------------------------------------- |
| DISCORD_APPLICATION_ID | Yes      | Application ID (bot runtime)                   |
| DISCORD_PUBLIC_KEY     | Yes      | Public key used to verify interaction requests |
| DISCORD_BOT_TOKEN      | Yes      | Bot authentication token                       |
| DISCORD_CLIENT_ID      | Yes      | OAuth2 client ID                               |
| DISCORD_CLIENT_SECRET  | Yes      | OAuth2 client secret                           |
| DISCORD_REDIRECT_URI   | Yes      | OAuth2 callback URL                            |

## 6. Invite the Bot

URL: `https://discord.com/api/oauth2/authorize?client_id=<CLIENT_ID>&permissions=0&scope=bot%20applications.commands`

## 7. Interactions Endpoint

Discord does not use a polling/webhook mode toggle. It delivers slash commands and
component interactions over an HTTP **interactions endpoint** that Discord signs and
your app verifies with `DISCORD_PUBLIC_KEY`.

1. Set `DISCORD_INTERACTIONS_ENDPOINT` to the discord-app-api route
   (`http://localhost:3007/discord/interactions` for local dev).
2. In the Discord Developer Portal, set the application's **Interactions Endpoint URL**
   to the same public URL (must be reachable over HTTPS in production).
3. Requests are verified against `DISCORD_PUBLIC_KEY`; invalid signatures are rejected.

## 8. Production Deployment

1. Set `discordAppApi.enabled: true` in .helm/values-production.yaml
2. Configure DISCORD_BOT_TOKEN as a Kubernetes secret
3. Toggle Discord features with `DISCORD_AUTH_ENABLED` and `DISCORD_COMMAND_REGISTRATION_ENABLED`
4. Ensure the interactions endpoint is reachable from Discord (public URL with TLS)
