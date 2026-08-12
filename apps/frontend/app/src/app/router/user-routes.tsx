import { AuthPage } from '../../pages/auth';
import { AuthDiscordCallbackPage } from '../../pages/auth-discord-callback';
import { AuthTelegramCallbackPage } from '../../pages/auth-telegram-callback';
import { ProfilePage } from '../../pages/profile';
import { SettingsPage } from '../../pages/settings';
import { TmaPage } from '../../pages/tma';
import { UserHomeContent } from '../../pages/user-home';
import { defineUserRoutes } from './user-route-registry';
import { useUserNavigate } from './user-navigation';
import { useUserRuntime } from './user-runtime-context';

function AuthRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  const navigate = useUserNavigate();
  return <AuthPage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} navigate={navigate} />;
}

function DiscordCallbackRouteComponent() {
  const navigate = useUserNavigate();
  return <AuthDiscordCallbackPage navigate={navigate} />;
}

function TelegramCallbackRouteComponent() {
  const navigate = useUserNavigate();
  return <AuthTelegramCallbackPage navigate={navigate} />;
}

function ProfileRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  return <ProfilePage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} />;
}

function SettingsRouteComponent() {
  const { applyUserLocale, applyUserTheme } = useUserRuntime();
  const navigate = useUserNavigate();
  return <SettingsPage applyUserLocale={applyUserLocale} applyUserTheme={applyUserTheme} navigate={navigate} />;
}

function TmaRouteComponent() {
  const navigate = useUserNavigate();
  return <TmaPage navigate={navigate} />;
}

function LinkTelegramRouteComponent() {
  const navigate = useUserNavigate();
  return <TmaPage fallbackStartParam="link_telegram" navigate={navigate} />;
}

/**
 * The user app's pages. This is the only file a product edits to add, replace or
 * drop a page: `user-route-tree` builds the router from it and `UserShell`
 * derives the bottom navigation from it, so a route and its nav entry cannot
 * disagree. `navParent` points an alias, callback or deep link at the
 * navigation destination it belongs to; `chrome: 'none'` opts a route out of
 * the app shell entirely.
 */
export const userRoutes = defineUserRoutes([
  {
    component: UserHomeContent,
    nav: { label: 'user.nav.home', order: 1 },
    path: '/',
  },
  { component: AuthRouteComponent, navParent: '/profile', path: '/auth' },
  {
    component: DiscordCallbackRouteComponent,
    navParent: '/profile',
    path: '/auth/discord/callback',
  },
  {
    component: TelegramCallbackRouteComponent,
    navParent: '/profile',
    path: '/auth/telegram/callback',
  },
  {
    component: ProfileRouteComponent,
    nav: { label: 'user.nav.profile', order: 2, variant: 'secondary' },
    path: '/profile',
  },
  {
    component: SettingsRouteComponent,
    nav: { label: 'user.nav.settings', order: 3, variant: 'secondary' },
    path: '/settings',
  },
  // `/tma`, `/tma/auth`, `/telegram-mini-app` are aliases for the same Telegram
  // mini-app view; `/link/telegram` opens it in account-linking mode.
  {
    component: TmaRouteComponent,
    nav: { label: 'auth.provider.telegram', order: 4, variant: 'secondary' },
    path: '/tma',
  },
  { component: TmaRouteComponent, navParent: '/tma', path: '/tma/auth' },
  { component: TmaRouteComponent, navParent: '/tma', path: '/telegram-mini-app' },
  { component: LinkTelegramRouteComponent, navParent: '/tma', path: '/link/telegram' },
  // `/link/discord` reuses the settings surface (Discord linking lives there).
  { component: SettingsRouteComponent, navParent: '/settings', path: '/link/discord' },
]);
