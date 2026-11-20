<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { formatDateShort } from '#lib/formatDate.ts';
	import { loadEvents } from '#lib/dataset.ts';
	import { filterAndSortEvents } from '#lib/search.ts';
	import type { EventItem } from '#lib/events.ts';

	// Searchable single-select for event titles backed by the local dataset.
	// Filtered in-memory and sorted by date proximity to `date` (if provided).
	//
	// Existing events only. Events come from ustreetcommunity.org, word for word
	// (see AGENTS.md), so a title typed here can't create one: the server links
	// a known title and drops anything else. The field used to offer "Use …" for
	// any text, which then saved as no event at all, without a word.
	let {
		name,
		label,
		placeholder = 'Search events',
		date,
		value: initial = '',
		onSelect
	}: {
		name: string;
		label?: string;
		placeholder?: string;
		date?: string;
		value?: string;
		/**
		 * Fires when an event is picked from the list, with the date shown on its row.
		 */
		onSelect?: (event: { name: string; date: string | null }) => void;
	} = $props();

	let open = $state(false);
	let search = $state(initial);
	const query = $derived(search.trim());
	// The title the form submits: the last event picked, or the starting value
	// (an edit page's, which may be an event not in the public list). Text that
	// names no event never gets here.
	// svelte-ignore state_referenced_locally
	let chosen = $state(initial);

	let allEvents = $state<EventItem[]>([]);
	let loading = $state(false);
	let loaded = false;
	let activeIndex = $state(-1);

	async function ensureLoaded() {
		if (loaded) return;
		loading = true;
		try {
			allEvents = await loadEvents();
			loaded = true;
		} catch (e) {
			console.error('Failed to load events for combobox:', e);
		} finally {
			loading = false;
		}
	}

	const items = $derived(filterAndSortEvents(allEvents, query, date));
	const total = $derived(items.length);

	/** The listed event whose title is exactly what was typed, ignoring case. */
	const exact = $derived(items.find((r) => r.name.toLowerCase() === query.toLowerCase()));

	onMount(() => {
		void ensureLoaded();
	});

	function onOpen() {
		open = true;
		void ensureLoaded();
	}

	// Typing reopens the list. Focus alone isn't enough: after a pick the input
	// keeps focus with the list closed, and changing the event should not need
	// a step out of the field and back in. The highlight goes back to where it
	// starts, since the rows under it have just changed.
	function onInput() {
		activeIndex = -1;
		onOpen();
	}

	/**
	 * Leaving the field settles it: emptied means no event, a title typed out in
	 * full picks that event, and anything else goes back to the event it held, so
	 * the field never shows text that won't be saved.
	 */
	function settle() {
		if (query === '') chosen = '';
		else if (exact) chooseItem(exact);
		else search = chosen;
	}

	function handleFocusOut(event: FocusEvent) {
		const next = event.relatedTarget;
		const container = event.currentTarget as HTMLElement;
		if (next instanceof Node && container.contains(next)) return;
		open = false;
		activeIndex = -1;
		settle();
	}

	function choose(val: string) {
		search = val;
		chosen = val;
		open = false;
	}

	function chooseItem(item: { name: string; date: string | null }) {
		choose(item.name);
		onSelect?.(item);
	}

	// --- Virtualized dropdown ------------------------------------------------
	let scrollEl = $state<HTMLDivElement>();
	const ROW_H = 40;
	const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>(
		untrack(() => ({
			count: items.length,
			getScrollElement: () => scrollEl ?? null,
			estimateSize: () => ROW_H,
			overscan: 8
		}))
	);

	$effect(() => {
		const count = items.length;
		const el = scrollEl;
		get(virtualizer).setOptions({
			count,
			getScrollElement: () => el ?? null,
			estimateSize: () => ROW_H,
			overscan: 8
		});
	});

	// --- Keyboard ------------------------------------------------------------
	function move(delta: number) {
		if (!open) {
			onOpen();
			return;
		}
		const next = Math.max(0, Math.min(total - 1, activeIndex + delta));
		activeIndex = next;
		if (next >= 0) get(virtualizer).scrollToIndex(next, { align: 'auto' });
	}
	function onKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				move(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				move(-1);
				break;
			case 'Enter': {
				// The highlighted row, or else the event whose title was typed out.
				const item = activeIndex >= 0 ? items[activeIndex] : exact;
				if (open && item) {
					event.preventDefault();
					chooseItem(item);
				}
				break;
			}
			case 'Escape':
				if (open) {
					event.preventDefault();
					open = false;
				}
				break;
		}
	}

	const listboxId = $derived(`${name}-listbox`);
</script>

<div class="flex flex-col gap-1.5">
	{#if label}
		<span id="{name}-label" class="block text-sm font-medium text-gray-700">{label}</span>
	{/if}
	<div class="relative" onfocusin={onOpen} onfocusout={handleFocusOut}>
		<input
			type="text"
			role="combobox"
			aria-expanded={open}
			aria-controls={listboxId}
			aria-autocomplete="list"
			aria-activedescendant={open && activeIndex >= 0 ? `${name}-opt-${activeIndex}` : undefined}
			autocomplete="off"
			{placeholder}
			bind:value={search}
			oninput={onInput}
			onkeydown={onKeydown}
			class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none md:text-sm"
		/>

		{#if open}
			<div
				id={listboxId}
				role="listbox"
				aria-label={label}
				class="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border bg-popover p-1 shadow-md"
			>
				<div bind:this={scrollEl} class="max-h-64 overflow-y-auto" style="scrollbar-width: thin;">
					{#if loading && total === 0}
						<div
							class="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground"
						>
							<CircleNotchIcon class="size-4 animate-spin" />
							<span>Loading events…</span>
						</div>
					{:else if total === 0}
						<div class="px-2 py-6 text-center text-sm text-muted-foreground">
							No event by that name.
						</div>
					{:else}
						<div style="position: relative; height: {$virtualizer.getTotalSize()}px;">
							{#each $virtualizer.getVirtualItems() as v (v.index)}
								{@const item = items[v.index]}
								<div
									id="{name}-opt-{v.index}"
									role="option"
									tabindex={-1}
									aria-selected={activeIndex === v.index}
									data-index={v.index}
									use:$virtualizer.measureElement
									onmousedown={(e) => {
										if (!item) return;
										e.preventDefault();
										chooseItem(item);
									}}
									onmouseenter={() => (activeIndex = v.index)}
									style="position: absolute; top: 0; left: 0; width: 100%; transform: translateY({v.start}px);"
									class="flex h-10 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm {activeIndex ===
									v.index
										? 'bg-accent text-accent-foreground'
										: ''}"
								>
									{#if item}
										<span class="truncate">{item.name}</span>
										{#if item.date}
											<span class="ms-auto shrink-0 text-xs text-muted-foreground">
												{formatDateShort(item.date)}
											</span>
										{/if}
									{:else}
										<span class="h-3 w-32 animate-pulse rounded bg-muted"></span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Resolved value the server action reads. -->
<input type="hidden" {name} value={chosen} />
