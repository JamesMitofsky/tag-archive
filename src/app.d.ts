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
			/** Set while an ImmersiveView is open: its id. Back pops it to close the view. */
			immersive?: string;
		}
		// interface Platform {}
	}
}

export {};
