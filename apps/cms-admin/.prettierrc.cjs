const baseConfig = require('@abyss/base-config/prettier').default;

module.exports = {
  ...baseConfig,
  overrides: [
    {
      files: ['./src/**'],
      options: {
        tailwindStylesheet: './src/assets/styles/globals.css',
        tailwindFunctions: ['clsx', 'cn', 'cva'],
      },
    },
    ...baseConfig.overrides,
  ],
};
