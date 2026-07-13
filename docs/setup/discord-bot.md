# Discord Bot Setup

## 1. Create a Discord Application

1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Set the name, then click "Create"

## 2. Bot Token

1. Go to **Bot** → **Reset Token** → **Confirm**
2. Copy the token to `DISCORD_BOT_TOKEN` in your .env

## 3. OAuth2 Setup

1. Go to **OAuth2** → scroll to **Client Secret** → **Reset Secret** → copy to `DISCORD_CLIENT_SECRET`
2. Copy the **Client ID** to `DISCORD_CLIENT_ID`
3. Under **Redirects**, add: `http://localhost:4200/auth/callback/discord` (local dev) or your production URL
4. Set `DISCORD_REDIRECT_URI` to match

## 4. Intents

Enable these in **Bot** → **Privileged Gateway Intents**:
- Message Content
- Server Members

## 5. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DISCORD_BOT_TOKEN | Yes | Bot authentication token |
| DISCORD_CLIENT_ID | Yes | OAuth2 client ID |
| DISCORD_CLIENT_SECRET | Yes | OAuth2 client secret |
| DISCORD_REDIRECT_URI | Yes | OAuth2 callback URL |

## 6. Invite the Bot

URL: `https://discord.com/api/oauth2/authorize?client_id=<CLIENT_ID>&permissions=0&scope=bot%20applications.commands`

## 7. Webhook vs Polling

| Mode | Use Case | Config |
|------|----------|--------|
| polling | Local development | `TELEGRAM_BOT_MODE=polling` |
| webhook | Production | Set up Discord webhook endpoint, `TELEGRAM_BOT_MODE=webhook` |

## 8. Production Deployment

1. Set `DISCORD_APP_ENABLED=true` in .helm/values-production.yaml
2. Configure DISCORD_BOT_TOKEN as a Kubernetes secret
3. Ensure the webhook endpoint is reachable from Discord (public URL with TLS)
