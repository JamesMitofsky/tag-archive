<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { formatDateShort } from '#lib/formatDate.ts';
	import { loadEvents } from '#lib/dataset.ts';
	import { filterAndSortEvents, type EventOption } from '#lib/search.ts';
	import type { EventItem } from '#lib/events.ts';

	// Searchable single-select for events backed by the local dataset. Filtered
	// in-memory and sorted by date proximity to `date` (if provided).
	//
	// Existing events only. Events come from ustreetcommunity.org, word for word
	// (see AGENTS.md), so a title typed here can't create one: the server links
	// a known title and drops anything else. The field used to offer "Use …" for
	// any text, which then saved as no event at all, without a word.
	//
	// Each dated occurrence of a recurring title is its own row, and two hidden
	// fields go to the server: `{name}`, the settled title, and `{name}Id`, the
	// id of the occurrence it settled on, so the server links that very day
	// rather than the title's earliest.
	let {
		name,
		label,
		placeholder = 'Search events',
		date,
		value: initial = '',
		eventId: initialId = null,
		onSelect
	}: {
		name: string;
		label?: string;
		placeholder?: string;
		date?: string;
		value?: string;
		/**
		 * The occurrence `value` already names: the linked event on an edit page,
		 * or the one a failed submit or a kept draft had picked.
		 */
		eventId?: number | string | null;
		/**
		 * Fires when an event is picked from the list, with the occurrence on its row.
		 */
		onSelect?: (event: EventOption) => void;
	} = $props();

	let open = $state(false);
	let search = $state(initial);
	const query = $derived(search.trim());
	// The title the form submits: the last event picked, or the starting value
	// (an edit page's, which may be an event not in the public list). Text that
	// names no event never gets here.
	// svelte-ignore state_referenced_locally
	let chosen = $state(initial);

	/** The occurrence picked, and the title it was picked under. */
	// Seeded once, like `search`: from here the box owns it.
	// svelte-ignore state_referenced_locally
	let picked = $state.raw<{ id: number; name: string } | null>(seedPick(initialId, initial));
	function seedPick(id: number | string | null, title: string) {
		const n = typeof id === 'string' ? Number(id.trim()) : id;
		return n !== null && Number.isSafeInteger(n) && n > 0 && title.trim()
			? { id: n, name: title.trim() }
			: null;
	}
	/** What `{name}Id` posts: the occurrence picked, while it is the settled event. */
	const pickedId = $derived(picked && picked.name === chosen.trim() ? picked.id : null);

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
		if (query === '') {
			chosen = '';
			picked = null;
		} else if (chosen && query.toLowerCase() === chosen.trim().toLowerCase()) {
			// Still the event it held: keep the occurrence picked, which the
			// title alone would move to whichever listed day sorts first.
			search = chosen;
		} else if (exact) chooseItem(exact);
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

	function chooseItem(item: EventOption) {
		picked = { id: item.id, name: item.name };
		choose(item.name);
		onSelect?.(item);
	}

	// The linked occurrence's date, shown in the box so a recurring title says
	// which of its days it is. Unknown until the dataset has loaded, or for an
	// event that left it: the link holds, there is just no date to show.
	const pickedDate = $derived(
		pickedId === null ? null : (allEvents.find((e) => e.id === pickedId)?.date ?? null)
	);

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
			class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none md:text-sm {pickedDate
				? 'pe-24'
				: ''}"
		/>
		{#if pickedDate}
			<span
				data-testid="{name}-picked-date"
				class="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted-foreground"
			>
				{formatDateShort(pickedDate)}
			</span>
		{/if}

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

<!-- Resolved values the server action reads: the settled title, and its occurrence. -->
<input type="hidden" {name} value={chosen} />
<input type="hidden" name="{name}Id" value={pickedId ?? ''} />
