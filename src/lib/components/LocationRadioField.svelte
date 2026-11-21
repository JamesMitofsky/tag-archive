<script lang="ts" module>
	/** Where the Archive keeps its physical items. Always offered, in this order. */
	export const LOCATION_PRESETS = ['Binder', 'Bin'] as const;
</script>

<script lang="ts">
	import { flushSync, tick } from 'svelte';
	import { Input } from '#lib/components/ui/input/index.ts';

	// The archival storage location, picked from a row of radio buttons. The
	// presets always show. Any other location (one already stored on an
	// artefact, or this field's starting value) shows after them, so an older,
	// typed-in location is still offered and an edit never drops it silently.
	// “Other…” opens a text box for a location not in the row yet.
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

	const sameText = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

	// Presets first, then the rest alphabetized. Deduped case-insensitively, and
	// the starting value's own spelling wins, so its radio is the one checked.
	const options = $derived.by(() => {
		const unique: string[] = [];
		for (const v of [initial, ...LOCATION_PRESETS, ...extra].map((v) => v.trim())) {
			if (v && !unique.some((u) => sameText(u, v))) unique.push(v);
		}
		const isPreset = (v: string) => LOCATION_PRESETS.some((p) => sameText(p, v));
		const presets = LOCATION_PRESETS.map((p) => unique.find((u) => sameText(u, p))!);
		const others = unique.filter((v) => !isPreset(v)).sort((a, b) => a.localeCompare(b));
		return [...presets, ...others];
	});

	// Which radio is picked: an option's own text, '' for “Not sure” (or nothing
	// yet), or OTHER while the text box is in use.
	const OTHER = Symbol('other');
	let choice = $state<string | typeof OTHER>(initial);
	let otherText = $state('');
	let otherInput = $state<HTMLInputElement | null>(null);

	// What “Other…” submits. Text that names a location already in the row is
	// sent in that location's spelling, so “binder” doesn't become a second Binder.
	const otherValue = $derived.by(() => {
		const typed = otherText.trim();
		return options.find((o) => sameText(o, typed)) ?? typed;
	});

	function pick(next: string | typeof OTHER) {
		choice = next;
		value = next === OTHER ? otherValue : next;
	}

	async function pickOther() {
		pick(OTHER);
		await tick();
		otherInput?.focus();
	}

	function typeOther(event: Event & { currentTarget: HTMLInputElement }) {
		otherText = event.currentTarget.value;
		pick(OTHER);
		// The “Other…” radio carries the typed text as its value, and that is what
		// the form posts. The form re-validates from its FormData on this same
		// input event as it bubbles, so the radio has to hold the text already.
		flushSync();
	}

	const radioClass =
		'flex cursor-pointer items-center gap-2 rounded-sm border border-gray-200 px-3 py-2 text-sm text-gray-900 transition hover:bg-gray-50 has-[:checked]:border-gray-800 has-[:checked]:bg-gray-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-gray-400';
</script>

<fieldset class="flex flex-col gap-1.5">
	<legend class="mb-1.5 block text-sm font-medium text-gray-700">{label}</legend>
	<div class="flex flex-wrap gap-2">
		{#each options as option (option)}
			<label class={radioClass}>
				<input
					type="radio"
					{name}
					value={option}
					checked={choice === option}
					onchange={() => pick(option)}
					class="accent-[#14120f]"
				/>
				{option}
			</label>
		{/each}
		<label class={radioClass}>
			<input
				type="radio"
				{name}
				value={otherValue}
				checked={choice === OTHER}
				onchange={pickOther}
				class="accent-[#14120f]"
			/>
			Other…
		</label>
		{#if optional}
			<label class={radioClass}>
				<input
					type="radio"
					{name}
					value=""
					checked={choice === ''}
					onchange={() => pick('')}
					class="accent-[#14120f]"
				/>
				Not sure
			</label>
		{/if}
	</div>
	{#if choice === OTHER}
		<!-- No name of its own: the “Other…” radio posts this text. -->
		<Input
			bind:ref={otherInput}
			aria-label="Other storage location"
			placeholder="Where is it kept?"
			maxlength={200}
			value={otherText}
			oninput={typeOther}
			class="mt-1"
		/>
	{/if}
</fieldset>
