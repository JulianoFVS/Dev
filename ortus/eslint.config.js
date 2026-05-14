const nextConfig = require('eslint-config-next');

const relaxedNextConfig = nextConfig.map((config) => {
  if (!config.plugins?.['react-hooks']) return config;

  return {
    ...config,
    rules: {
      ...config.rules,
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  };
});

module.exports = [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'],
  },
  ...relaxedNextConfig,
];
