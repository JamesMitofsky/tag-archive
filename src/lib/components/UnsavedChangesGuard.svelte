<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	// Warns before leaving a form with unsaved edits. Snapshots the form's fields on
	// mount and compares against them lazily at navigation time, so it needs no
	// per-field wiring: bind the <form> element and drop this in.
	let {
		form,
		enabled = true,
		title = 'Discard unsaved changes?',
		description = 'You have unsaved changes. If you leave now, they will be lost.'
	}: {
		form?: HTMLFormElement;
		enabled?: boolean;
		title?: string;
		description?: string;
	} = $props();

	let snapshot: string | null = null;
	let confirmedLeave = false;
	let pendingUrl: URL | null = null;
	let showPrompt = $state(false);

	// Stable, order-preserving serialization of the form's string fields (skips
	// File entries so forms with uploads don't throw). Custom fields — DateField,
	// TagsField, ComboField — all mirror into hidden inputs, so they're captured.
	function serialize(): string {
		if (!form) return '';
		const parts: string[] = [];
		for (const [key, value] of new FormData(form).entries()) {
			if (typeof value === 'string') parts.push(`${key}=${value}`);
		}
		return parts.join('&');
	}

	function isDirty(): boolean {
		return enabled && snapshot !== null && serialize() !== snapshot;
	}

	$effect(() => {
		if (!form) return;
		// Baseline the current values (including any echoed after a failed submit).
		if (snapshot === null) snapshot = serialize();
		// A submit re-baselines: a successful one redirects away without a false
		// prompt; a cancelled one leaves the form clean at its just-attempted state.
		const onSubmit = () => {
			snapshot = serialize();
		};
		form.addEventListener('submit', onSubmit);
		return () => form.removeEventListener('submit', onSubmit);
	});

	// Client-side (SPA) navigation: cancel, then re-issue once the user confirms.
	beforeNavigate((nav) => {
		if (confirmedLeave || nav.willUnload || !nav.to || !isDirty()) return;
		nav.cancel();
		pendingUrl = nav.to.url;
		showPrompt = true;
	});

	function leave() {
		showPrompt = false;
		confirmedLeave = true;
		if (pendingUrl) goto(pendingUrl);
	}

	function stay() {
		showPrompt = false;
		pendingUrl = null;
	}

	// Tab close / refresh / external navigation: native browser prompt.
	function handleBeforeUnload(event: BeforeUnloadEvent) {
		if (!isDirty()) return;
		event.preventDefault();
		event.returnValue = '';
	}
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<Dialog.Root
	bind:open={showPrompt}
	onOpenChange={(open) => {
		if (!open) stay();
	}}
>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{title}</Dialog.Title>
			<Dialog.Description>{description}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={stay}>Keep editing</Button>
			<Button variant="destructive" onclick={leave}>Leave</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
