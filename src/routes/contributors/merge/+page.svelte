<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import MergePicker from '$lib/components/MergePicker.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Merge contributors · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<BackButton href="/contributors" ariaLabel="Back to Contributors" />
			<h1 class="mt-3 text-2xl font-semibold tracking-tight text-[#14120f]">Merge contributors</h1>
		</header>

		<!-- Likely duplicates: near-match groups the roster can't surface itself
		     (names are unique, so dupes differ by accent/order/typo/initials).
		     Matches chain transitively, so a group can hold more than two — the
		     review page reuses this same picker, scoped to the group. -->
		{#if data.duplicates.length > 0}
			<section class="mb-6">
				<h2 class="text-sm font-semibold text-[#14120f]">
					Likely duplicates
					<span class="ml-1 font-normal text-gray-400">{data.duplicates.length}</span>
				</h2>
				<ul class="mt-3 space-y-3">
					{#each data.duplicates as group (group.members.map((m) => m.id).join('-'))}
						{@const ids = group.members.map((m) => m.id).join(',')}
						<li class="rounded-sm bg-white/95 p-4 text-gray-900 shadow-sm ring-1 ring-black/5">
							<div class="flex items-center justify-between gap-3">
								<div class="min-w-0">
									<p class="text-sm break-words">
										{#each group.members as member, i (member.id)}{#if i > 0}<span
													class="text-gray-400"> · </span
												>{/if}<span class="font-medium">{member.name}</span>{/each}
									</p>
									<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
										<span class="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{group.reason}</span
										>
										<span>{group.members.length} entries</span>
									</p>
								</div>
								<a
									href="/contributors/merge/review?ids={ids}"
									class="shrink-0 rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-50 hover:text-gray-900"
								>
									Review
								</a>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<MergePicker people={data.people} error={form?.error} />
	</div>
</main>
