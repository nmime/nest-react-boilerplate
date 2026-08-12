import { Outlet } from '@tanstack/react-router';
import { useInAppLinkNavigation } from './user-navigation';

/**
 * Root route component for every user route, with or without app chrome.
 * Holds only behaviour that must survive a `chrome: 'none'` route — today the
 * in-app anchor delegation — so the shell stays a pure layout concern.
 */
export function UserRoot() {
  useInAppLinkNavigation();

  return <Outlet />;
}
