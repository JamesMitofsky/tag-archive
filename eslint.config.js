import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// Allow deliberately-unused bindings prefixed with `_` (e.g. `{#each items as _, i}`).
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_'
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	{
		// Type information for every file, which `no-deprecated` needs: it reads
		// the `@deprecated` tags of whatever a file uses, from SvelteKit, Svelte
		// and every other dependency. Files sit in the root tsconfig, or in the
		// ones under scripts/ and .storybook/. The root-level config files that no
		// tsconfig covers fall back to a default project.
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.js', 'prettier.config.js', 'vitest.shims.d.ts']
				},
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			// Fails the lint, so a deprecation is replaced when it appears rather
			// than found later in a sweep. Where an old API is kept on purpose,
			// disable the rule on that line and say why.
			'@typescript-eslint/no-deprecated': 'error'
		}
	},
	{
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/no-raw-special-elements': 'off'
		}
	}
);
