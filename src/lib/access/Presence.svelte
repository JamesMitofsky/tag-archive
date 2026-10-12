<!--
	Keeps the access pass alive while the site is on screen (see $lib/access/presence
	for the why and the schedule). Mounted once in the root layout, outside the
	per-route transition, and not on the locked page or the keeper sign-in page,
	where the visitor holds no pass to keep alive.

	A 401 beat means the archive has drifted shut while the tab was away: the
	visitor is shown the locked page — except where that would cost them their
	work (KEEPS_WORK_WHEN_LOCKED), where the page's own refusal takes over and
	the beats carry on, so a fresh tap in another tab picks the pass straight
	back up.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { isUnder, KEEPS_WORK_WHEN_LOCKED, LOCKED_PATH } from '$lib/access/paths';
	import { sendBeat, sendLeave, startPresence } from '$lib/access/presence';

	onMount(() => {
		const touch = async () => {
			let status: number;
			try {
				({ status } = await sendBeat());
			} catch {
				return; // offline or aborted: the next beat tries again
			}
			if (status !== 401) return;
			const keepsWork = KEEPS_WORK_WHEN_LOCKED.some((p) => isUnder(page.url.pathname, p));
			if (!keepsWork) goto(LOCKED_PATH);
		};
		return startPresence({ touch, leave: sendLeave });
	});
</script>
