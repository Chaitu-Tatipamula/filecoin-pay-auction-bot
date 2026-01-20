import neostandard from 'neostandard'

export default [
  ...neostandard({
    noStyle: true, // Disable style-related rules, we use Prettier
    ts: true,
  }),
  {
    languageOptions: {
      ecmaVersion: 2025,
      sourceType: 'module',
    },
  },
]
