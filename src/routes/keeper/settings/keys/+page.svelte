<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import BackButton from '#lib/components/BackButton.svelte';
	import CopyButton from '#lib/components/CopyButton.svelte';
	import FieldError from '#lib/components/FieldError.svelte';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import KeyIcon from 'phosphor-svelte/lib/KeyIcon';
	import ShuffleIcon from 'phosphor-svelte/lib/ShuffleIcon';
	import { createValidator } from '#lib/validation/client.svelte.ts';
	import {
		createRemoteKeySuite,
		DEFAULT_KEY_DAYS,
		KEY_MAX,
		parseRemoteKeyForm,
		randomSuffix
	} from '#lib/validation/remoteKey.ts';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Errors = Record<string, string[]>;

	const createForm = $derived(
		form && 'create' in form
			? (form.create as { key: string; expiresOn: string; errors: Errors })
			: null
	);

	const editForm = $derived(
		form && 'edit' in form
			? (form.edit as { key: string; expiresOn: string; errors: Errors })
			: null
	);

	const created = $derived(form && 'created' in form ? (form.created as string) : null);
	const missing = $derived(form && 'missing' in form ? (form.missing as string) : null);
	const validator = createValidator(createRemoteKeySuite(), () => createForm?.errors ?? {});
	let createEl = $state<HTMLFormElement>();
	// The create form's fields. They start from a refused no-JS submit's values,
	// if any; with JS, a refused submit leaves them as typed and a success puts
	// them back to blank and a week out (see the form's enhance callback). Not
	// left to the browser's form reset, which would blank the date: its default
	// lives here, not in the markup.
	let keyValue = $state(untrack(() => createForm?.key ?? ''));
	let expiresOn = $state(untrack(() => createForm?.expiresOn ?? data.defaultExpiresOn));
	let submitting = $state(false);
	/** The key whose row has a request in flight, so only that row shows it. */
	let busyKey = $state<string | null>(null);

	function revalidate() {
		if (createEl) validator.run(parseRemoteKeyForm(new FormData(createEl)));
	}
	function markTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) validator.touch(target.name);
		revalidate();
	}
	function addSuffix() {
		const base = keyValue.trim().toLowerCase().replace(/-+$/, '');
		const suffix = randomSuffix();
		keyValue = (base ? `${base}-${suffix}` : suffix).slice(-KEY_MAX);
		validator.touch('key');
		queueMicrotask(revalidate);
	}

	const linkFor = (key: string) => `${data.linkBase}${encodeURIComponent(key)}`;

	/** When a key stops opening, for people: a bare date reads "through" that day. */
	function describeEnd(row: PageData['keys'][number]): string {
		if (/^\d{4}-\d{2}-\d{2}$/.test(row.expiresAt)) {
			const day = new Date(`${row.expiresAt}T00:00:00Z`).toLocaleDateString(undefined, {
				dateStyle: 'medium',
				timeZone: 'UTC'
			});

			return row.open ? `Open through ${day}` : `Closed after ${day}`;
		}
		const moment = new Date(row.endsAt).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
		return row.open ? `Open until ${moment}` : `Closed ${moment}`;
	}

	/** Mark one row busy for the length of its request. */
	const rowAction =
		(key: string, confirmText?: string): SubmitFunction =>
		({ cancel }) => {
			if (confirmText && !confirm(confirmText)) {
				cancel();
				return;
			}
			busyKey = key;
			return async ({ update }) => {
				await update({ reset: false });
				busyKey = null;
			};
		};

	const fieldClass =
		'mt-1 w-full rounded-sm border border-gray-300 px-3 py-2 text-gray-900 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none';
	const quietButton =
		'rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';
</script>

<svelte:head>
	<title>Unlock keys · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl space-y-6">
		<BackButton />

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
				<KeyIcon size={24} class="text-gray-500" />
				Unlock keys
			</h1>
			<p class="mt-2 text-sm text-gray-600">
				A key opens the whole archive from anywhere, without the Cube, until the end of its expiry
				date (UTC). Give each person their own key, so you can close one without closing the rest.
			</p>

			{#if created}
				<div class="mt-6 rounded-sm border border-green-200 bg-green-50 p-4" role="status">
					<p class="flex items-center gap-2 font-medium text-green-800">
						<CheckCircleIcon size={20} weight="fill" />
						Key created
					</p>
					<p class="mt-2 text-sm text-green-800">Send this link to the person it's for:</p>
					<!-- A grid, not flex: a minmax(0, 1fr) track keeps the long link from
					     widening the page at phone width, which `truncate` alone does not. -->
					<div class="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
						<code class="truncate rounded-sm bg-white px-2 py-1 text-sm text-gray-800">
							{linkFor(created)}
						</code>
						<CopyButton text={linkFor(created)} label="Copy link" />
					</div>
				</div>
			{/if}

			<form
				method="POST"
				action="?/create"
				bind:this={createEl}
				oninput={revalidate}
				onfocusout={markTouched}
				use:enhance={({ formData, cancel }) => {
					validator.revealAll();
					if (!validator.run(parseRemoteKeyForm(formData))) {
						cancel();
						return;
					}
					submitting = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						if (result.type === 'success') {
							keyValue = '';
							expiresOn = data.defaultExpiresOn;
						}
						submitting = false;
					};
				}}
				class="mt-6 space-y-5"
			>
				<div>
					<label class="block text-sm font-medium text-gray-800" for="key">Key</label>
					<div class="flex items-start gap-2">
						<input
							id="key"
							name="key"
							type="text"
							required
							autocomplete="off"
							autocapitalize="none"
							spellcheck="false"
							maxlength={KEY_MAX}
							placeholder="tobyshorin"
							bind:value={keyValue}
							class={fieldClass}
						/>
						<button
							type="button"
							onclick={addSuffix}
							title="Add a random ending"
							aria-label="Add a random ending"
							class="mt-1 inline-flex items-center rounded-sm border border-gray-300 p-2.5 text-gray-700 transition hover:bg-gray-50 hover:text-gray-900"
						>
							<ShuffleIcon size={18} />
						</button>
					</div>
					<FieldError message={validator.error('key')} />
					<p class="mt-1 text-xs text-gray-500">
						Letters, numbers and hyphens. A name alone can be guessed, so add a random ending for
						anything you'd rather keep private.
					</p>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-800" for="expiresOn">
						Open through
					</label>
					<input
						id="expiresOn"
						name="expiresOn"
						type="date"
						required
						min={data.today}
						bind:value={expiresOn}
						class="{fieldClass} sm:w-56"
					/>
					<FieldError message={validator.error('expiresOn')} />
					<p class="mt-1 text-xs text-gray-500">
						{DEFAULT_KEY_DAYS} days from today unless you pick another date.
					</p>
				</div>

				<button
					type="submit"
					disabled={submitting}
					aria-busy={submitting}
					class="flex items-center gap-2 rounded-sm bg-[#14120f] px-4 py-2 text-sm text-white transition hover:bg-[#33302a] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if submitting}
						<CircleNotchIcon size={16} class="shrink-0 animate-spin" />
					{/if}
					Create key
				</button>
			</form>
		</article>

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			<h2 class="text-lg font-semibold tracking-tight">Keys</h2>

			{#if missing}
				<p class="mt-3 text-sm text-red-600" role="alert">
					“{missing}” no longer exists. Someone may have removed it already.
				</p>
			{/if}

			{#if data.keys.length === 0}
				<p class="mt-3 text-sm text-gray-600">No keys yet.</p>
			{:else}
				<ul class="mt-4 divide-y divide-gray-200">
					{#each data.keys as row (row.key)}
						{@const busy = busyKey === row.key}
						{@const editError =
							editForm?.key === row.key ? editForm.errors.expiresOn?.[0] : undefined}
						<li class="py-4 first:pt-0 last:pb-0">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<span class="font-medium break-all text-gray-900">{row.key}</span>
								<span
									class="rounded-full px-2 py-0.5 text-xs font-medium ring-1 {row.open
										? 'bg-green-50 text-green-800 ring-green-200'
										: 'bg-gray-100 text-gray-600 ring-gray-200'}"
								>
									{describeEnd(row)}
								</span>
							</div>

							{#if row.open}
								<div class="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
									<code class="truncate rounded-sm bg-gray-50 px-2 py-1 text-xs text-gray-700">
										{linkFor(row.key)}
									</code>
									<CopyButton text={linkFor(row.key)} label="Copy link for {row.key}" />
								</div>
							{/if}

							<div class="mt-3 flex flex-wrap items-end gap-2">
								<form
									method="POST"
									action="?/setExpiry"
									use:enhance={rowAction(row.key)}
									class="flex items-end gap-2"
								>
									<input type="hidden" name="key" value={row.key} />
									<label class="text-xs text-gray-600">
										Open through
										<input
											name="expiresOn"
											type="date"
											required
											min={data.today}
											value={editForm?.key === row.key
												? editForm.expiresOn
												: row.expiresAt.slice(0, 10)}
											aria-invalid={editError ? 'true' : undefined}
											class="mt-0.5 block rounded-sm border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none"
										/>
									</label>
									<button type="submit" disabled={busy} class={quietButton}>Save</button>
								</form>

								{#if row.open}
									<form method="POST" action="?/end" use:enhance={rowAction(row.key)}>
										<input type="hidden" name="key" value={row.key} />
										<button type="submit" disabled={busy} class={quietButton}>Close now</button>
									</form>
								{/if}

								<form
									method="POST"
									action="?/delete"
									use:enhance={rowAction(
										row.key,
										`Delete the key “${row.key}”? Its link stops working at once.`
									)}
								>
									<input type="hidden" name="key" value={row.key} />
									<button
										type="submit"
										disabled={busy}
										class="rounded-sm px-3 py-1.5 text-sm text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
									>
										Delete
									</button>
								</form>

								{#if busy}
									<CircleNotchIcon size={16} class="mb-2 shrink-0 animate-spin text-gray-500" />
								{/if}
							</div>
							<FieldError message={editError} />
						</li>
					{/each}
				</ul>
			{/if}
		</article>
	</div>
</main>
