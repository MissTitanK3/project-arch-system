import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        ignores: [
            '**/dist/**',
            '**/node_modules/**',
            '**/.turbo/**'
        ],
    },
    {
        files: ['scripts/**/*.mjs'],
        languageOptions: {
            globals: {
                process: 'readonly',
                console: 'readonly',
            },
        },
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'warn',
        },
    }
);
