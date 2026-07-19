import { createAuthClient } from 'better-auth/svelte';
import { adminClient, emailOTPClient } from 'better-auth/client/plugins';

/**
 * Browser-side better-auth client. The /keepers auth flow itself runs
 * through server form actions (progressive enhancement); this client exists
 * for reactive session state and future admin operations.
 */
export const authClient = createAuthClient({
	plugins: [emailOTPClient(), adminClient()]
});
