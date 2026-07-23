<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import MergePicker from '$lib/components/MergePicker.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Review likely duplicates · Cloud Keeper · TAG Archive</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<header class="mb-8">
			<h1 class="text-2xl font-semibold tracking-tight text-[#14120f]">Review likely duplicates</h1>
			<BackButton class="mt-2" />
		</header>

		<MergePicker people={data.members} error={form?.error} />
	</div>
</main>
