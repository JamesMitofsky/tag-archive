<script lang="ts">
	import BackButton from '$lib/components/BackButton.svelte';
	import ImageSetCreateForm from '$lib/components/ImageSetCreateForm.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>New photographs · Cloud Keeper</title>
</svelte:head>

<main class="relative min-h-dvh overflow-x-hidden px-4 py-8 sm:py-12">
	<div class="relative z-10 mx-auto w-full max-w-2xl">
		<!-- The create form is a fresh sheet of paper, like the image set pages. -->
		<BackButton class="mb-6" />

		<section class="rounded-sm bg-white/95 p-6 shadow-xl ring-1 ring-black/5">
			<h1 class="text-2xl font-semibold tracking-tight text-gray-900">New photographs</h1>
			<ImageSetCreateForm {form} />
		</section>
	</div>
</main>
