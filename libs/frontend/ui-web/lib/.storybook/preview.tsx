import { useEffect, type JSX } from 'react';
import type { Preview } from '@storybook/react-vite';
import '../src/styles.css';

const LandmarkGuard = ({ Story, isAppComposition }: { Story: () => JSX.Element; isAppComposition: boolean }) => {
  useEffect(() => {
    const updateResizeHandles = () => {
      for (const handle of document.querySelectorAll<HTMLElement>('[role="separator"][aria-label$="resize handle"]')) {
        if (!handle.closest("main,nav,header,footer,aside,[role='main']")) {
          handle.setAttribute('role', 'presentation');
          handle.setAttribute('aria-hidden', 'true');
          handle.setAttribute('tabindex', '-1');
        }
      }
    };
    updateResizeHandles();
    const observer = new MutationObserver(updateResizeHandles);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, []);
  return isAppComposition ? (
    <div data-storybook-app-composition="">
      <Story />
    </div>
  ) : (
    <main aria-label="Storybook preview content">
      <Story />
    </main>
  );
};

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <LandmarkGuard isAppComposition={context.parameters['appComposition'] === true} Story={Story} />
    ),
  ],
  parameters: {
    // `error` makes an axe violation fail `test:storybook` rather than only
    // annotating the Storybook UI.
    a11y: { test: 'error' },
    layout: 'centered',
  },
};

export default preview;
