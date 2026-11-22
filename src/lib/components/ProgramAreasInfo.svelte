<script lang="ts">
	import InfoIcon from 'phosphor-svelte/lib/InfoIcon';
	import * as Popover from '#lib/components/ui/popover/index.ts';
	import {
		PROGRAM_AREAS,
		PROGRAM_AREA_DESCRIPTIONS,
		PROGRAM_AREA_META
	} from '#lib/programAreas.ts';

	// An info bubble beside the program-area picker that says what each area
	// means, in the lookbook's words (see PROGRAM_AREA_DESCRIPTIONS). Areas the
	// lookbook doesn't describe are left out rather than given made-up copy.
	const described = PROGRAM_AREAS.flatMap((area) => {
		const copy = PROGRAM_AREA_DESCRIPTIONS[area];
		return copy ? [{ area, ...copy, meta: PROGRAM_AREA_META[area] }] : [];
	});
</script>

<Popover.Root>
	<Popover.Trigger
		type="button"
		aria-label="What the program areas mean"
		class="inline-flex size-5 items-center justify-center rounded-full text-gray-500 transition hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:outline-none"
	>
		<InfoIcon size={16} weight="bold" />
	</Popover.Trigger>
	<!-- The trigger announces a dialog (aria-haspopup), but bits-ui gives the
	     content no role, so name it one here. -->
	<Popover.Content
		role="dialog"
		aria-label="Program areas"
		align="start"
		collisionPadding={16}
		class="max-h-[min(28rem,var(--bits-popover-content-available-height))] w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-y-auto p-4"
	>
		<ul class="space-y-4">
			{#each described as { area, lead, body, meta } (area)}
				{@const Icon = meta.icon}
				<li>
					<p class="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
						<span class="inline-flex size-5 items-center justify-center rounded {meta.accent}">
							<Icon size={13} weight="fill" class="text-white" />
						</span>
						{area}
					</p>
					<p class="mt-1 text-[13px] leading-relaxed text-gray-700">
						<strong class="font-semibold text-gray-900">{lead}</strong>
						{body}
					</p>
				</li>
			{/each}
		</ul>
	</Popover.Content>
</Popover.Root>
