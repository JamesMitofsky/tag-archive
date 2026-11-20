<script lang="ts" module>
	/** Where the Archive keeps its physical items. Always offered, in this order. */
	export const LOCATION_PRESETS = ['Binder', 'Bin'] as const;
</script>

<script lang="ts">
	// The archival storage location, picked from a row of radio buttons. The
	// presets always show. Any other location (one already stored on an
	// artefact, or this field's starting value) shows after them, so an older,
	// typed-in location is still offered and an edit never drops it silently.
	let {
		name = 'location',
		label,
		extra = [],
		optional = false,
		value = $bindable('')
	}: {
		name?: string;
		label: string;
		/** Other locations to offer after the presets, such as ones already in use. */
		extra?: string[];
		/** Adds a “Not sure” choice, submitted as an empty value. */
		optional?: boolean;
		value?: string;
	} = $props();

	// The starting value, read once: options are built from it so that picking
	// another radio doesn't make an older location vanish from the row. A form
	// that restores a draft remounts this field, which reads it again.
	const initial = value.trim();

	// Presets first, then the rest alphabetized. Deduped case-insensitively, and
	// the starting value's own spelling wins, so its radio is the one checked.
	const options = $derived.by(() => {
		const unique: string[] = [];
		for (const v of [initial, ...LOCATION_PRESETS, ...extra].map((v) => v.trim())) {
			if (v && !unique.some((u) => u.toLowerCase() === v.toLowerCase())) unique.push(v);
		}
		const isPreset = (v: string) =>
			LOCATION_PRESETS.some((p) => p.toLowerCase() === v.toLowerCase());
		const presets = LOCATION_PRESETS.map((p) =>
			unique.find((u) => u.toLowerCase() === p.toLowerCase())!
		);
		const others = unique.filter((v) => !isPreset(v)).sort((a, b) => a.localeCompare(b));
		return [...presets, ...others];
	});

	const choices = $derived(
		optional
			? [...options.map((v) => ({ value: v, label: v })), { value: '', label: 'Not sure' }]
			: options.map((v) => ({ value: v, label: v }))
	);
</script>

<fieldset class="flex flex-col gap-1.5">
	<legend class="mb-1.5 block text-sm font-medium text-gray-700">{label}</legend>
	<div class="flex flex-wrap gap-2">
		{#each choices as choice (choice.value)}
			<label
				class="flex cursor-pointer items-center gap-2 rounded-sm border border-gray-200 px-3 py-2 text-sm text-gray-900 transition hover:bg-gray-50 has-[:checked]:border-gray-800 has-[:checked]:bg-gray-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gray-400"
			>
				<input
					type="radio"
					{name}
					value={choice.value}
					bind:group={value}
					class="accent-[#14120f]"
				/>
				{choice.label}
			</label>
		{/each}
	</div>
</fieldset>
