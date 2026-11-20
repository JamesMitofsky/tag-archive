import { variables } from '../../env.ts';

type Source = Record<string, string | undefined>;

/**
 * A stand-in for `$app/env/private` in server specs, for `vi.mock`:
 *
 *   vi.mock('$app/env/private', async () =>
 *     (await import('#lib/testing/env.ts')).privateEnv()
 *   );
 *
 * SvelteKit fills the real module when the Vite config loads, before a spec
 * sets any variables, so specs hand it this instead. It has one export per
 * variable src/env.ts declares, each read from `source` (by default the live
 * `process.env`) whenever it is used, so a spec can change a variable between
 * tests. One that isn't set reads as `undefined`, as it does in the app.
 */
export function privateEnv(source: Source = process.env): Record<string, string | undefined> {
	const env = {};
	for (const name of Object.keys(variables)) {
		Object.defineProperty(env, name, { enumerable: true, get: () => source[name] });
	}
	return env;
}
