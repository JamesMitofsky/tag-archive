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
		</header>

		<article class="rounded-sm bg-white/95 p-6 text-gray-900 shadow-xl ring-1 ring-black/5 sm:p-8">
			<h1 class="text-2xl font-semibold tracking-tight">Settings</h1>

			<dl class="mt-6 space-y-3 border-t border-gray-200 pt-5 text-sm">
				<div class="flex flex-wrap gap-x-2">
					<dt class="font-medium text-gray-500">Signed in as</dt>
					<dd class="text-gray-800">{data.user.email}</dd>
				</div>
				<div class="flex flex-wrap gap-x-2">
					<dt class="font-medium text-gray-500">Role</dt>
					<dd class="text-gray-800">{data.user.role}</dd>
				</div>
			</dl>

			{#if data.user.role === 'admin'}
				<div class="mt-6 border-t border-gray-200 pt-6">
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

			<form method="POST" action="?/signOut" use:enhance class="mt-8 border-t border-gray-200 pt-6">
				<button
					type="submit"
					class="inline-flex items-center gap-2 rounded-sm bg-[#14120f] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#33302a]"
				>
					<SignOutIcon size={18} />
					Sign out
				</button>
			</form>
		</article>
	</div>
</main>
