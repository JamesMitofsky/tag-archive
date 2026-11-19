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
	// Icon buttons come out at 24px (14 + 2 × 4 padding + 2 × 1 border), the
	// WCAG 2.5.8 minimum target size, so don't shrink them further.
	const iconSize = $derived(iconOnly ? 14 : 15);
	const iconWeight = $derived(iconOnly ? 'regular' : 'bold');

	// Labeled: a filled primary Approve beside an outlined Reject. Icon: approve
	// stacked over reject, both outlined (secondary) but tinted in their own color.
	// The approve icon uses a darker shade of the brand green (#8cb369 is only
	// 2.4:1 on white; #5a8a38 clears the 3:1 minimum for icons).
	const base =
		'inline-flex items-center gap-1.5 rounded-full text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50';
	const approveClass = $derived(
		iconOnly
			? 'border border-[#5a8a38]/40 bg-[#8cb369]/10 p-1 text-[#5a8a38] hover:border-[#5a8a38] hover:bg-[#8cb369]/25'
			: 'bg-[#8cb369] px-3.5 py-1.5 text-white shadow-sm hover:bg-[#7aa259]'
	);
	const rejectClass = $derived(
		iconOnly
			? 'border border-[#bc4b51]/40 bg-[#bc4b51]/5 p-1 text-[#bc4b51] hover:border-[#bc4b51] hover:bg-[#bc4b51]/15'
			: 'border border-gray-300 px-3.5 py-1.5 text-gray-700 hover:border-[#bc4b51] hover:text-[#bc4b51]'
	);

	// Guard double-submits while the action is in flight.
	let approving = $state(false);
	let rejecting = $state(false);
</script>

<div class="flex {iconOnly ? 'flex-col gap-1' : 'mt-4 items-center gap-2'} {className}">
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
			class="{base} {approveClass}"
		>
			{#if approving}
				<CircleNotchIcon size={iconSize} class="shrink-0 animate-spin" />
			{:else}
				<CheckIcon size={iconSize} weight={iconWeight} />
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
			class="{base} {rejectClass}"
		>
			{#if rejecting}
				<CircleNotchIcon size={iconSize} class="shrink-0 animate-spin" />
			{:else}
				<XIcon size={iconSize} weight={iconWeight} />
			{/if}
			{#if !iconOnly}Reject{/if}
		</button>
	</form>
</div>
