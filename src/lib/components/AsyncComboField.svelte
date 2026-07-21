<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { get } from 'svelte/store';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import PlusIcon from 'phosphor-svelte/lib/PlusIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { formatDateShort } from '$lib/formatDate';

	// Searchable single-select for a *large* server-backed list (event titles today).
	// Unlike ComboField it never loads the whole set: it fetches a page at a time from
	// `endpoint` (filtered server-side by the live query) and virtualizes the dropdown,
	// so only the visible rows mount no matter how many titles exist. Like ComboField,
	// the live text doubles as the submitted value and accepts a typed-in custom entry,
	// mirrored into a hidden <input> so the native form POST still sends `name=<value>`.
	type Row = { name: string; date: string | null };

	let {
		name,
		label,
		placeholder = 'Search or add…',
		endpoint,
		date,
		value: initial = '',
		pageSize = 40
	}: {
		name: string;
		label?: string;
		placeholder?: string;
		/** GET `?q=&offset=&limit=` → `{ rows: {name,date}[], total }`. */
		endpoint: string;
		date?: string;
		value?: string;
		pageSize?: number;
	} = $props();

	let open = $state(false);
	// Live text in the search box — also the candidate custom value and the value the
	// server reads. Seeded from any echoed/existing value.
	// svelte-ignore state_referenced_locally
	let search = $state(initial);
	const query = $derived(search.trim());

	// Sparse array the length of the whole (filtered) result: a hole (undefined) renders
	// as a skeleton until its page arrives. `total` is the distinct-title count.
	let items = $state<(Row | undefined)[]>([]);
	let total = $state(0);
	// Highlighted row for keyboard nav. -1 = the custom-entry row (when shown).
	let activeIndex = $state(-1);

	// Page bookkeeping — deliberately plain Sets, not reactive: they gate fetches and
	// must not trigger re-renders (only `items`/`total` drive the view).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const loaded = new Set<number>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const loading = new Set<number>();
	// Bumped on every fresh search so stale in-flight pages from an old query drop.
	let version = 0;
	let initialized = false;
	// True while a fresh top-of-list search is in flight, so the dropdown can show a
	// spinner instead of "No results." before the first page lands.
	let searching = $state(false);

	function seed(rows: Row[], count: number): (Row | undefined)[] {
		const arr = new Array<Row | undefined>(count);
		for (let i = 0; i < rows.length; i++) arr[i] = rows[i];
		return arr;
	}

	// Offer the typed text as a custom entry unless a *loaded* row already matches it.
	// Only loaded rows are checked (the rest aren't in memory), but an exact-title
	// custom pick resolves to the same event server-side, so a stray duplicate is safe.
	const showCustom = $derived(
		query.length > 0 && !items.some((r) => r && r.name.toLowerCase() === query.toLowerCase())
	);

	async function fetchPage(page: number) {
		const base = page * pageSize;
		if (page < 0 || base >= total || loaded.has(page) || loading.has(page)) return;
		loading.add(page);
		const v = version;
		try {
			const params = new SvelteURLSearchParams({
				q: query,
				offset: String(base),
				limit: String(pageSize)
			});
			if (date) params.set('date', date);
			const res = await fetch(`${endpoint}?${params}`);
			if (!res.ok || v !== version) return;
			const body: { rows: Row[]; total: number } = await res.json();
			if (v !== version) return;
			for (let i = 0; i < body.rows.length; i++) items[base + i] = body.rows[i];
			loaded.add(page);
		} finally {
			loading.delete(page);
		}
	}

	// Fresh search from the top: new total, new sparse array, page cache wiped.
	async function runSearch() {
		version += 1;
		const v = version;
		loaded.clear();
		loading.clear();
		activeIndex = -1;
		searching = true;
		try {
			const params = new SvelteURLSearchParams({ q: query, offset: '0', limit: String(pageSize) });
			if (date) params.set('date', date);
			const res = await fetch(`${endpoint}?${params}`);
			if (!res.ok || v !== version) return;
			const body: { rows: Row[]; total: number } = await res.json();
			if (v !== version) return;
			total = body.total;
			items = seed(body.rows, body.total);
			loaded.add(0);
		} finally {
			// Only the latest search clears the flag; a superseded run leaves it set for
			// the newer one still in flight.
			if (v === version) searching = false;
		}
	}

	// Debounce the search box; skip the run that just echoes a programmatic pick.
	let lastQuery = untrack(() => query);
	let timer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const q = query;
		if (!open) return;
		if (q === lastQuery) return;
		lastQuery = q;
		clearTimeout(timer);
		timer = setTimeout(runSearch, 150);
	});

	function onOpen() {
		open = true;
		if (!initialized) {
			initialized = true;
			lastQuery = query;
			runSearch();
		}
	}

	// Prioritise the list by proximity to the date as soon as one is set (or changed),
	// without waiting for focus — the server re-orders by the `date` param, so re-run the
	// search whenever it changes and pre-empt the focus-time first run.
	let lastDate = untrack(() => date);
	$effect(() => {
		const d = date;
		if (d === lastDate) return;
		lastDate = d;
		if (!d) return;
		initialized = true;
		lastQuery = query;
		runSearch();
	});

	// Close when focus leaves the whole field (relatedTarget outside the container).
	function handleFocusOut(event: FocusEvent) {
		const next = event.relatedTarget;
		const container = event.currentTarget as HTMLElement;
		if (next instanceof Node && container.contains(next)) return;
		open = false;
	}

	function choose(value: string) {
		search = value;
		lastQuery = value.trim();
		open = false;
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

	// Re-sync the virtualizer when the row count or the (late-bound) scroll element
	// changes. setOptions runs `_willUpdate`, which re-attaches observers once the
	// dropdown's scroll container exists. Read the instance with get() — subscribing
	// to `$virtualizer` here would loop on every scroll.
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

	// Pull in any pages the rendered window just scrolled into view.
	$effect(() => {
		const rendered = $virtualizer.getVirtualItems();
		if (!open || rendered.length === 0) return;
		const first = rendered[0].index;
		const last = rendered[rendered.length - 1].index;
		for (let p = Math.floor(first / pageSize); p <= Math.floor(last / pageSize); p++) fetchPage(p);
	});

	// --- Keyboard ------------------------------------------------------------
	const minIndex = $derived(showCustom ? -1 : 0);
	function move(delta: number) {
		if (!open) {
			onOpen();
			return;
		}
		const next = Math.max(minIndex, Math.min(total - 1, activeIndex + delta));
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
			case 'Enter':
				if (open && (activeIndex >= 0 || (activeIndex === -1 && showCustom))) {
					event.preventDefault();
					if (activeIndex === -1) choose(query);
					else if (items[activeIndex]) choose(items[activeIndex]!.name);
				}
				break;
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
				<!-- Custom-entry row sits outside the virtualized area so list indices stay
				     aligned with server rows. -->
				{#if showCustom}
					<div
						id="{name}-opt--1"
						role="option"
						tabindex={-1}
						aria-selected={activeIndex === -1}
						onmousedown={(e) => {
							e.preventDefault();
							choose(query);
						}}
						class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm {activeIndex ===
						-1
							? 'bg-accent text-accent-foreground'
							: ''}"
					>
						<PlusIcon class="size-4" />
						Use “{query}”
					</div>
				{/if}

				<div bind:this={scrollEl} class="max-h-64 overflow-y-auto" style="scrollbar-width: thin;">
					{#if searching && total === 0}
						<div
							class="flex items-center justify-center gap-2 px-2 py-6 text-sm text-muted-foreground"
						>
							<CircleNotchIcon class="size-4 animate-spin" />
							<span>Searching events…</span>
						</div>
					{:else if total === 0}
						<div class="px-2 py-6 text-center text-sm text-muted-foreground">No results.</div>
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
										choose(item.name);
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
											<span class="ms-auto shrink-0 text-xs text-muted-foreground"
												>{formatDateShort(item.date)}</span
											>
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
<input type="hidden" {name} value={search} />
