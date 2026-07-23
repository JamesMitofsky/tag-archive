<script lang="ts">
	import { enhance } from '$app/forms';
	import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
	import FieldError from '$lib/components/FieldError.svelte';
	import UnsavedChangesGuard from '$lib/components/UnsavedChangesGuard.svelte';
	import UserPlusIcon from 'phosphor-svelte/lib/UserPlusIcon';
	import CheckCircleIcon from 'phosphor-svelte/lib/CheckCircleIcon';
	import CircleNotchIcon from 'phosphor-svelte/lib/CircleNotchIcon';
	import { createNewUserSuite, parseCreateUserForm } from '$lib/validation/auth';
	import { createValidator } from '$lib/validation/client.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const serverErrors = $derived(
		form && 'errors' in form && form.errors ? (form.errors as Record<string, string[]>) : {}
	);
	const formError = $derived(form && 'error' in form ? form.error : undefined);

	const validator = createValidator(createNewUserSuite(), () => serverErrors);
	let formEl = $state<HTMLFormElement>();
	let submitting = $state(false);

	function revalidate() {
		if (formEl) validator.run(parseCreateUserForm(new FormData(formEl)));
	}
	function markTouched(event: FocusEvent) {
		const target = event.target as HTMLInputElement | null;
		if (target?.name) validator.touch(target.name);
		revalidate();
	}

	// Human-friendly labels + one-line descriptions for each assignable role.
	const roleMeta: Record<string, { label: string; blurb: string }> = {
		contributor: { label: 'Contributor', blurb: 'Submits entries as proposed additions.' },
		admin: { label: 'Admin', blurb: 'Full access: edit, vet, and manage accounts.' }
	};

	const fieldClass =
		'mt-1 w-full rounded-sm border border-gray-300 px-3 py-2 text-gray-900 focus:border-gray-500 focus:ring-1 focus:ring-gray-500 focus:outline-none';
</script>

<svelte:head>
	<title>New account · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<UnsavedChangesGuard form={formEl} />
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<Breadcrumbs class="mb-6" />

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			<h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight">
				<UserPlusIcon size={24} class="text-gray-500" />
				New account
			</h1>

			{#if form && 'created' in form && form.created}
				<!-- Success: the account exists; they sign in with their own email code. -->
				<div class="mt-8 rounded-sm border border-green-200 bg-green-50 p-4">
					<p class="flex items-center gap-2 font-medium text-green-800">
						<CheckCircleIcon size={20} weight="fill" />
						Account created
					</p>
					<p class="mt-2 text-sm text-green-800">
						<span class="font-medium">{form.created.name}</span> ({form.created.email}) can now sign
						in with an email code as
						<span class="font-medium"
							>{roleMeta[form.created.role]?.label ?? form.created.role}</span
						>.
					</p>
				</div>
				<div class="mt-6 flex gap-3">
					<a
						href="/keeper/settings/create-user"
						class="rounded-sm bg-[#14120f] px-4 py-2 text-sm text-white transition hover:bg-[#33302a]"
					>
						Create another
					</a>
					<a
						href="/keeper/settings"
						class="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-800 transition hover:bg-gray-50"
					>
						Back to settings
					</a>
				</div>
			{:else}
				<p class="mt-2 text-sm text-gray-600">
					Create an account and set its role. The person signs in with a one-time email code — no
					password needed.
				</p>

				<form
					method="POST"
					action="?/createUser"
					bind:this={formEl}
					oninput={revalidate}
					onfocusout={markTouched}
					use:enhance={({ formData, cancel }) => {
						validator.revealAll();
						if (!validator.run(parseCreateUserForm(formData))) {
							cancel();
							return;
						}
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
						};
					}}
					class="mt-6 space-y-5"
				>
					<div>
						<label class="block text-sm font-medium text-gray-800" for="name">Name</label>
						<input
							id="name"
							name="name"
							type="text"
							required
							autocomplete="off"
							value={form && 'name' in form ? form.name : ''}
							class={fieldClass}
						/>
						<FieldError message={validator.error('name')} />
					</div>

					<div>
						<label class="block text-sm font-medium text-gray-800" for="email">Email</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							autocomplete="off"
							placeholder="you@email.community"
							value={form && 'email' in form ? form.email : ''}
							class={fieldClass}
						/>
						<FieldError message={validator.error('email')} />
					</div>

					<div>
						<span class="block text-sm font-medium text-gray-800">Role</span>
						<div class="mt-2 space-y-2">
							{#each data.roles as role (role)}
								<label
									class="flex cursor-pointer items-start gap-3 rounded-sm border border-gray-200 px-4 py-3 transition hover:bg-gray-50 has-[:checked]:border-gray-800 has-[:checked]:bg-gray-50"
								>
									<input
										type="radio"
										name="role"
										value={role}
										checked={(form && 'role' in form ? form.role : 'contributor') === role}
										class="mt-0.5 accent-[#14120f]"
									/>
									<span class="min-w-0">
										<span class="block text-sm font-medium text-gray-900"
											>{roleMeta[role]?.label ?? role}</span
										>
										<span class="block text-sm text-gray-600">{roleMeta[role]?.blurb ?? ''}</span>
									</span>
								</label>
							{/each}
						</div>
						<FieldError message={validator.error('role')} />
					</div>

					{#if formError}
						<p class="text-sm text-red-600" role="alert">{formError}</p>
					{/if}

					<button
						type="submit"
						disabled={submitting}
						aria-busy={submitting}
						class="flex items-center gap-2 rounded-sm bg-[#14120f] px-4 py-2 text-sm text-white transition hover:bg-[#33302a] disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if submitting}
							<CircleNotchIcon size={16} class="shrink-0 animate-spin" />
						{/if}
						Create account
					</button>
				</form>
			{/if}
		</article>
	</div>
</main>
