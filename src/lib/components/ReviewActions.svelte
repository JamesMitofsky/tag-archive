<script lang="ts">
	import { enhance } from '$app/forms';
	import CheckIcon from 'phosphor-svelte/lib/CheckIcon';
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';

	// Approve / reject buttons for one pending row. Both post to the page's
	// `?/approve` and `?/reject` actions with the row id; `use:enhance` reloads the
	// queue so the vetted (or discarded) row drops off without a full navigation.
	//
	// `icon` drops the text labels for a pair of round buttons that fit in a list
	// card's corner; the labels move to aria-label and title.
	type Props = { id: number; variant?: 'labeled' | 'icon'; class?: string };
	let { id, variant = 'labeled', class: className = '' }: Props = $props();

	const iconOnly = $derived(variant === 'icon');
	const iconSize = $derived(iconOnly ? 16 : 15);

	// Guard double-submits while the action is in flight.
	let approving = $state(false);
	let rejecting = $state(false);
</script>

<div class="flex items-center gap-2 {iconOnly ? '' : 'mt-4'} {className}">
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
			aria-label={iconOnly ? 'Approve' : undefined}
			title={iconOnly ? 'Approve' : undefined}
			class="inline-flex items-center gap-1.5 rounded-full bg-[#8cb369] text-sm font-medium text-white shadow-sm transition hover:bg-[#7aa259] disabled:cursor-not-allowed disabled:opacity-50
			{iconOnly ? 'p-1.5' : 'px-3.5 py-1.5'}"
		>
			{#if approving}
				<CircleNotchIcon size={iconSize} class="shrink-0 animate-spin" />
			{:else}
				<CheckIcon size={iconSize} weight="bold" />
			{/if}
			{#if !iconOnly}Approve{/if}
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
			aria-label={iconOnly ? 'Reject' : undefined}
			title={iconOnly ? 'Reject' : undefined}
			class="inline-flex items-center gap-1.5 rounded-full border border-gray-300 text-sm font-medium text-gray-700 transition hover:border-[#bc4b51] hover:text-[#bc4b51] disabled:cursor-not-allowed disabled:opacity-50
			{iconOnly ? 'bg-white p-[5px]' : 'px-3.5 py-1.5'}"
		>
			{#if rejecting}
				<CircleNotchIcon size={iconSize} class="shrink-0 animate-spin" />
			{:else}
				<XIcon size={iconSize} weight="bold" />
			{/if}
			{#if !iconOnly}Reject{/if}
		</button>
	</form>
</div>
