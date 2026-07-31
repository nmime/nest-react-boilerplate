import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { AuthPage } from '../../pages/auth';
import { AuthDiscordCallbackPage } from '../../pages/auth-discord-callback';
import { AuthTelegramCallbackPage } from '../../pages/auth-telegram-callback';
import { ProfilePage } from '../../pages/profile';
import { SettingsPage } from '../../pages/settings';
import { TmaPage } from '../../pages/tma';
import { UserHomeContent } from '../../pages/user-home';
import { UserShell } from './user-shell';
import { useUserNavigate } from './user-navigation';
import { useUserRuntime } from './user-runtime-context';

const rootRoute = createRootRoute({
  component: UserShell,
  notFoundComponent: () => <UserHomeContent />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: UserHomeContent,
});

function AuthRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  const navigate = useUserNavigate();
  return <AuthPage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} navigate={navigate} />;
}

const authRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth', component: AuthRouteComponent });

function DiscordCallbackRouteComponent() {
  const navigate = useUserNavigate();
  return <AuthDiscordCallbackPage navigate={navigate} />;
}

const discordCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/discord/callback',
  component: DiscordCallbackRouteComponent,
});

function TelegramCallbackRouteComponent() {
  const navigate = useUserNavigate();
  return <AuthTelegramCallbackPage navigate={navigate} />;
}

const telegramCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/auth/telegram/callback',
  component: TelegramCallbackRouteComponent,
});

function ProfileRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  return <ProfilePage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} />;
}

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/profile',
  component: ProfileRouteComponent,
});

function SettingsRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  const navigate = useUserNavigate();
  return <SettingsPage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} navigate={navigate} />;
}

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRouteComponent,
});

function TmaRouteComponent() {
  const navigate = useUserNavigate();
  return <TmaPage navigate={navigate} />;
}

// `/tma`, `/tma/auth`, `/telegram-mini-app` are aliases for the same Telegram
// mini-app view; `/link/telegram` opens it in account-linking mode.
const tmaRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tma', component: TmaRouteComponent });
const tmaAuthRoute = createRoute({ getParentRoute: () => rootRoute, path: '/tma/auth', component: TmaRouteComponent });
const telegramMiniAppRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/telegram-mini-app',
  component: TmaRouteComponent,
});

function LinkTelegramRouteComponent() {
  const navigate = useUserNavigate();
  return <TmaPage fallbackStartParam="link_telegram" navigate={navigate} />;
}

const linkTelegramRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/link/telegram',
  component: LinkTelegramRouteComponent,
});

// `/link/discord` reuses the settings surface (Discord linking lives there).
const linkDiscordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/link/discord',
  component: SettingsRouteComponent,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  authRoute,
  discordCallbackRoute,
  telegramCallbackRoute,
  profileRoute,
  settingsRoute,
  tmaRoute,
  tmaAuthRoute,
  telegramMiniAppRoute,
  linkTelegramRoute,
  linkDiscordRoute,
]);

export const createUserRouter = (history: RouterHistory = createBrowserHistory()) =>
  createRouter({
    routeTree,
    history,
    trailingSlash: 'never',
    defaultPreload: false,
  });

export type UserRouter = ReturnType<typeof createUserRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: UserRouter;
  }
}
