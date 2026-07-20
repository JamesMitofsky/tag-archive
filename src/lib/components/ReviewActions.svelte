<script lang="ts">
	import { enhance } from '$app/forms';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';

	// Approve / reject buttons for one pending row. Both post to the page's
	// `?/approve` and `?/reject` actions with the row id; `use:enhance` reloads the
	// queue so the vetted (or discarded) row drops off without a full navigation.
	let { id }: { id: number } = $props();

	// Guard double-submits while the action is in flight.
	let busy = $state(false);
</script>

<div class="mt-4 flex items-center gap-2">
	<form
		method="POST"
		action="?/approve"
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="id" value={id} />
		<button
			type="submit"
			disabled={busy}
			class="inline-flex items-center gap-1.5 rounded-full bg-[#8cb369] px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-[#7aa259] disabled:opacity-50"
		>
			<CheckIcon size={15} weight="bold" />
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
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="id" value={id} />
		<button
			type="submit"
			disabled={busy}
			class="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3.5 py-1.5 text-sm font-medium text-gray-700 transition hover:border-[#bc4b51] hover:text-[#bc4b51] disabled:opacity-50"
		>
			<XIcon size={15} weight="bold" />
			Reject
		</button>
	</form>
</div>
