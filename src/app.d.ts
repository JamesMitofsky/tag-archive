import type { auth } from '$lib/server/auth';

// Inferred from the configured instance so plugin fields (e.g. user.role from
// the admin plugin) are typed on locals.
type AuthSession = typeof auth.$Infer.Session;

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user?: AuthSession['user'];
			session?: AuthSession['session'];
		}

		// interface Error {}
		// interface PageData {}
		interface PageState {
			/** Set on the history entries an open ImmersiveView stacks: that open's token. */
			immersive?: string;
			/** Which of those entries this is, from 0. */
			immersiveStep?: number;
		}
		// interface Platform {}
	}
}

export {};
