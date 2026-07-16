import { useEffect, type JSX } from 'react';
import type { Preview } from '@storybook/react-vite';
import '../src/styles.css';

const LandmarkGuard = ({ Story }: { Story: () => JSX.Element }) => {
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
  return (
    <main aria-label="Storybook preview content">
      <Story />
    </main>
  );
};

const preview: Preview = {
  decorators: [(Story) => <LandmarkGuard Story={Story} />],
  parameters: { layout: 'centered' },
};

export default preview;
