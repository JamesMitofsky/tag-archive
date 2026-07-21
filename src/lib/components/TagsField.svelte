<script lang="ts">
	import XIcon from 'phosphor-svelte/lib/XIcon';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';

	type PersonResult = { id?: number; name: string };

	// Searchable tags input that queries an endpoint (defaulting to /api/people)
	// for existing names to prevent duplicate creation. Composed from Input + Badge,
	// mirrored into a hidden <input> as a comma-joined string.
	let {
		name,
		label,
		placeholder = '',
		endpoint = '/api/people',
		value = $bindable([])
	}: {
		name: string;
		label?: string;
		placeholder?: string;
		endpoint?: string;
		value?: string[];
	} = $props();

	let draft = $state('');
	let open = $state(false);
	let suggestions = $state<PersonResult[]>([]);
	let loading = $state(false);
	let activeIndex = $state(-1);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;

	const query = $derived(draft.trim());

	// Filter out items already selected as tags
	const filteredSuggestions = $derived(suggestions.filter((item) => !value.includes(item.name)));

	// Show custom entry option if user typed something not already selected or matched in suggestions
	const showCustom = $derived(
		query.length > 0 &&
			!value.includes(query) &&
			!filteredSuggestions.some((s) => s.name.toLowerCase() === query.toLowerCase())
	);

	async function fetchSuggestions(q: string) {
		if (!endpoint) return;
		loading = true;
		try {
			const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
			if (res.ok) {
				const data = await res.json();
				suggestions = data.results || data.rows || [];
			}
		} catch (e) {
			console.error('Failed to fetch suggestions:', e);
		} finally {
			loading = false;
		}
	}

	function onInput() {
		open = true;
		activeIndex = -1;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			fetchSuggestions(query);
		}, 150);
	}

	function onOpen() {
		open = true;
		if (suggestions.length === 0 && !loading) {
			fetchSuggestions(query);
		}
	}

	function handleFocusOut(event: FocusEvent) {
		const next = event.relatedTarget;
		const container = event.currentTarget as HTMLElement;
		if (next instanceof Node && container.contains(next)) return;
		open = false;
		activeIndex = -1;
	}

	function addTag(raw: string) {
		const tag = raw.trim();
		if (tag && !value.includes(tag)) {
			value = [...value, tag];
		}
		draft = '';
		open = false;
		activeIndex = -1;
	}

	function removeTag(index: number) {
		value = value.filter((_, i) => i !== index);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			if (!open) {
				onOpen();
			} else {
				const maxIndex = filteredSuggestions.length - 1;
				if (activeIndex < maxIndex) {
					activeIndex++;
				}
			}
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			if (open) {
				const minIndex = showCustom ? -1 : 0;
				if (activeIndex > minIndex) {
					activeIndex--;
				}
			}
		} else if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			if (open && activeIndex >= 0 && filteredSuggestions[activeIndex]) {
				addTag(filteredSuggestions[activeIndex].name);
			} else if (query) {
				addTag(query);
			}
		} else if (event.key === 'Escape') {
			if (open) {
				event.preventDefault();
				open = false;
				activeIndex = -1;
			}
		} else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
			removeTag(value.length - 1);
		}
	}
</script>

<div class="flex flex-col gap-1.5">
	{#if label}
		<span class="block text-sm font-medium text-gray-700">{label}</span>
	{/if}

	<div class="relative" onfocusin={onOpen} onfocusout={handleFocusOut}>
		<Input
			{placeholder}
			bind:value={draft}
			{onkeydown}
			oninput={onInput}
			autocomplete="off"
			role="combobox"
			aria-expanded={open}
			aria-autocomplete="list"
		/>

		{#if open && (filteredSuggestions.length > 0 || showCustom || loading)}
			<div
				role="listbox"
				class="absolute top-full right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 text-gray-900 shadow-lg"
			>
				{#if loading && filteredSuggestions.length === 0}
					<div class="flex items-center gap-2 px-3 py-2 text-xs text-gray-500">
						<CircleNotchIcon class="size-3 animate-spin" />
						<span>Searching existing contributors…</span>
					</div>
				{/if}

				{#each filteredSuggestions as item, index (item.name)}
					<button
						type="button"
						role="option"
						aria-selected={activeIndex === index}
						tabindex={-1}
						onmousedown={(e) => {
							e.preventDefault();
							addTag(item.name);
						}}
						class="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 {activeIndex ===
						index
							? 'bg-gray-100 font-medium text-gray-900'
							: 'text-gray-700'}"
					>
						<span>{item.name}</span>
						<span class="text-xs text-gray-400">Existing</span>
					</button>
				{/each}

				{#if showCustom}
					<button
						type="button"
						role="option"
						aria-selected={activeIndex === -1}
						tabindex={-1}
						onmousedown={(e) => {
							e.preventDefault();
							addTag(query);
						}}
						class="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 {activeIndex ===
						-1
							? 'bg-gray-100 font-medium text-gray-900'
							: 'text-gray-700'}"
					>
						<PlusIcon class="size-4 shrink-0 text-gray-500" />
						<span>Use “{query}” <span class="text-xs text-gray-400">(new person)</span></span>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if value.length > 0}
		<div class="mt-1 flex flex-wrap items-center gap-2">
			{#each value as tag, index (tag)}
				<Badge variant="secondary" class="gap-1">
					{tag}
					<button
						type="button"
						aria-label={`Remove ${tag}`}
						onclick={() => removeTag(index)}
						class="-me-0.5 flex items-center text-muted-foreground hover:text-foreground"
					>
						<XIcon class="size-3" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}
</div>

<!-- Comma-joined value the server action reads. -->
<input type="hidden" {name} value={value.join(',')} />
