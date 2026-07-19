<script lang="ts">
	import { enhance } from '$app/forms';
	import ArrowLeftIcon from 'phosphor-svelte/lib/ArrowLeftIcon';
	import SignOutIcon from 'phosphor-svelte/lib/SignOutIcon';
	import UsersIcon from 'phosphor-svelte/lib/UsersIcon';
	import ArrowRightIcon from 'phosphor-svelte/lib/ArrowRightIcon';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Settings · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8 flex items-start justify-between gap-4">
			<a
				href="/keeper"
				aria-label="Back to Cloud Keeper"
				title="Back to Cloud Keeper"
				class="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/25 px-3 py-2 text-sm text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
			>
				<ArrowLeftIcon size={18} />
				Back
			</a>

			<form method="POST" action="?/signOut" use:enhance>
				<button
					type="submit"
					aria-label="Sign out"
					title="Sign out"
					class="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/25 p-2 text-gray-700 shadow-sm backdrop-blur-md transition hover:bg-white/40 hover:text-gray-900"
				>
					<SignOutIcon size={18} />
				</button>
			</form>
		</header>

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>

			<p class="mt-10 text-lg text-gray-800">{data.user.email}</p>

			{#if data.user.role === 'admin'}
				<div class="mt-6 pt-6">
					<a
						href="/contributors"
						class="flex items-center justify-between gap-3 rounded-sm border border-gray-200 px-4 py-3 text-sm text-gray-800 transition hover:bg-gray-50"
					>
						<span class="flex items-center gap-2">
							<UsersIcon size={18} />
							Contributors
						</span>
						<ArrowRightIcon size={18} class="text-gray-400" />
					</a>
				</div>
			{/if}
		</article>
	</div>
</main>
