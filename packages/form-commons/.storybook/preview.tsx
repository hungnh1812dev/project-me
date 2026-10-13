import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview, ReactRenderer } from '@storybook/react-vite';

import './preview.css';

const preview: Preview = {
  decorators: [
    // The toolbar puts `dark` on <html>, like cms-admin's theme switch (AC-8).
    withThemeByClassName<ReactRenderer>({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
      parentSelector: 'html',
    }),
  ],
};

export default preview;
