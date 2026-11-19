import type { auth } from '#lib/server/auth.ts';

// Inferred from the configured instance so plugin fields (e.g. user.role from
// the admin plugin) are typed on locals.
type AuthSession = typeof auth.$Infer.Session;

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			/** The signed-in keeper: an account whose role has keeper tools (see #lib/roles). */
			user?: AuthSession['user'];
			/**
			 * The signed-in listener: an account that only opens the archive from
			 * anywhere. Never set alongside `user`, so no keeper check ever sees one.
			 */
			listener?: AuthSession['user'];
			/** The session of whichever of the two is signed in. */
			session?: AuthSession['session'];
			/** The visitor's access pass, when they hold one (see #lib/access/pass). */
			pass?: import('#lib/access/pass.ts').Pass;
		}

		// interface Error {}
		// interface PageData {}
		interface PageState {
			/** Set on the history entries an open ImmersiveView stacks: that open's token. */
			immersive?: string;
			/** Which of those entries this is, from 0. */
			immersiveStep?: number;
			/** On /images: the image set this entry was pushed to open (see that page). */
			imageSet?: number;
		}
		// interface Platform {}
	}
}

export {};
