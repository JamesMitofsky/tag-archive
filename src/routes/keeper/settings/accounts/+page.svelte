<script lang="ts">
	import FieldError from '#lib/components/FieldError.svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import BackButton from '#lib/components/BackButton.svelte';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import UserGearIcon from 'phosphor-svelte/lib/UserGearIcon';
	import { isRole, ROLE_META, roleLabel } from '#lib/roles.ts';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const updatedId = $derived(form && 'updated' in form ? (form.updated?.id ?? null) : null);

	const errorFor = $derived(
		form && 'error' in form ? { id: form.id as string, message: form.error as string } : null
	);

	/** The account whose row has a request in flight, so only that row shows it. */
	let busyId = $state<string | null>(null);

	const rowAction =
		(id: string): SubmitFunction =>
		() => {
			busyId = id;
			return async ({ update }) => {
				// Keep the select on what was picked; the reload brings the stored role.
				await update({ reset: false });
				busyId = null;
			};
		};

	const quietButton =
		'inline-flex items-center gap-1.5 rounded-sm border border-gray-300 px-3 py-1.5 text-sm text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50';
	const selectClass =
		'rounded-sm border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none';
</script>

<svelte:head>
	<title>Accounts · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl space-y-6">
		<BackButton />

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
				<UserGearIcon size={24} class="text-gray-500" />
				Accounts
			</h1>
			<p class="mt-2 text-sm text-gray-600">
				Every account opens the Archive from anywhere once signed in. The role decides what else it
				can do. Someone already signed in sees a new role within five minutes.
			</p>

			<dl class="mt-4 space-y-1 text-sm text-gray-600">
				{#each data.roles as role (role)}
					<div>
						<dt class="inline font-medium text-gray-800">{ROLE_META[role].label}:</dt>
						<dd class="inline">{ROLE_META[role].blurb}</dd>
					</div>
				{/each}
			</dl>

			<ul class="mt-6 divide-y divide-gray-200 border-t border-gray-200">
				{#each data.accounts as account (account.id)}
					<li class="py-4">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="min-w-0">
								<p class="truncate font-medium text-gray-900">{account.name}</p>
								<p class="truncate text-sm text-gray-600">{account.email}</p>
							</div>

							{#if account.id === data.selfId}
								<!-- Your own role is not changed here, so the archive keeps an admin. -->
								<p class="text-sm text-gray-600">{roleLabel(account.role)} (you)</p>
							{:else}
								<form
									method="POST"
									action="?/setRole"
									use:enhance={rowAction(account.id)}
									class="flex items-center gap-2"
								>
									<input type="hidden" name="id" value={account.id} />
									<label class="sr-only" for="role-{account.id}">Role for {account.name}</label>
									<select
										id="role-{account.id}"
										name="role"
										value={isRole(account.role) ? account.role : ''}
										class={selectClass}
									>
										{#if !isRole(account.role)}
											<option value="" disabled>{roleLabel(account.role)}</option>
										{/if}
										{#each data.roles as role (role)}
											<option value={role}>{ROLE_META[role].label}</option>
										{/each}
									</select>
									<button
										type="submit"
										disabled={busyId === account.id}
										aria-busy={busyId === account.id}
										class={quietButton}
									>
										{#if busyId === account.id}
											<CircleNotchIcon size={14} class="shrink-0 animate-spin" />
										{/if}
										Save
									</button>
								</form>
							{/if}
						</div>

						{#if updatedId === account.id}
							<p class="mt-2 flex items-center gap-1.5 text-sm text-green-800" role="status">
								<CheckCircleIcon size={16} weight="fill" />
								Now {roleLabel(account.role)}
							</p>
						{:else if errorFor?.id === account.id}
							<FieldError message={errorFor.message} class="mt-2" />
						{/if}
					</li>
				{:else}
					<li class="py-4 text-sm text-gray-600">No accounts yet.</li>
				{/each}
			</ul>
		</article>
	</div>
</main>
