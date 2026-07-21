<script lang="ts">
	import { enhance } from '$app/forms';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';

	// Approve / reject buttons for one pending row. Both post to the page's
	// `?/approve` and `?/reject` actions with the row id; `use:enhance` reloads the
	// queue so the vetted (or discarded) row drops off without a full navigation.
	let { id }: { id: number } = $props();

	// Guard double-submits while the action is in flight.
	let approving = $state(false);
	let rejecting = $state(false);
</script>

<div class="mt-4 flex items-center gap-2">
	<form
		method="POST"
		action="?/approve"
		use:enhance={() => {
			approving = true;
			return async ({ update }) => {
				await update();
				approving = false;
			};
		}}
	>
		<input type="hidden" name="id" value={id} />
		<button
			type="submit"
			disabled={approving || rejecting}
			aria-busy={approving}
			class="inline-flex items-center gap-1.5 rounded-full bg-[#8cb369] px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#7aa259] disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if approving}
				<CircleNotchIcon size={15} class="animate-spin shrink-0" />
			{:else}
				<CheckIcon size={15} weight="bold" />
			{/if}
			Approve
		</button>
	</form>

	<form
		method="POST"
		action="?/reject"
		use:enhance={({ cancel }) => {
			// Rejecting deletes the submission — confirm before the irreversible write.
			if (!confirm('Reject and permanently delete this submission?')) {
				cancel();
				return;
			}
			rejecting = true;
			return async ({ update }) => {
				await update();
				rejecting = false;
			};
		}}
	>
		<input type="hidden" name="id" value={id} />
		<button
			type="submit"
			disabled={approving || rejecting}
			aria-busy={rejecting}
			class="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3.5 py-1.5 text-sm font-medium text-gray-700 transition hover:border-[#bc4b51] hover:text-[#bc4b51] disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if rejecting}
				<CircleNotchIcon size={15} class="animate-spin shrink-0" />
			{:else}
				<XIcon size={15} weight="bold" />
			{/if}
			Reject
		</button>
	</form>
</div>
