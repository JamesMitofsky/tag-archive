# Dialogs

Display modal popups using the native HTML dialog element.

```svelte
<script lang="ts">
	let dialogRef: HTMLDialogElement;

	function showModal() {
		dialogRef?.showModal();
	}

	function closeModal() {
		dialogRef?.close();
	}
</script>

<!-- Dialog -->
<dialog bind:this={dialogRef} class="dialog preset-filled-surface-100-900 animate-dialog">
	<header>
		<h2 class="h3">Hello world!</h2>
	</header>
	<article>
		<p>This is an example modal created using the native Dialog element.</p>
	</article>
	<footer class="flex justify-end">
		<form method="dialog">
			<button type="button" class="btn preset-tonal" onclick={closeModal}>Close</button>
		</form>
	</footer>
</dialog>

<!-- Trigger -->
<button class="btn preset-filled" onclick={showModal}>Open Dialog</button>

```

## Alert Dialog

Set [`role="alertdialog"`](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/alertdialog_role) for dialogs that interrupt the user with a message requiring a response.

```svelte
<script lang="ts">
	let dialogRef: HTMLDialogElement;

	function showModal() {
		dialogRef?.showModal();
	}

	function closeModal() {
		dialogRef?.close();
	}
</script>

<!-- Dialog -->
<dialog
	bind:this={dialogRef}
	role="alertdialog"
	aria-labelledby="alertdialog-title"
	aria-describedby="alertdialog-description"
	class="dialog animate-dialog preset-filled-error-500 [--dialog-backdrop:color-mix(in_oklab,var(--color-error-50-950)_75%,transparent)]"
>
	<header>
		<h2 id="alertdialog-title" class="h3">Discard changes?</h2>
	</header>
	<article>
		<p id="alertdialog-description">You have unsaved changes that will be lost. This action cannot be undone.</p>
	</article>
	<footer class="flex justify-end gap-2">
		<button type="button" class="btn preset-tonal" onclick={closeModal}>Cancel</button>
		<button type="button" class="btn preset-filled" onclick={closeModal}>Discard</button>
	</footer>
</dialog>

<!-- Trigger -->
<button class="btn preset-filled" onclick={showModal}>Open Dialog</button>

```

## Non-Modal

Call [`show()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/show) instead of `showModal()` to open a dialog without a backdrop or top-layer placement. Similar to a tooltip.

```svelte
<script lang="ts">
	let dialogRef: HTMLDialogElement;

	function toggle() {
		if (!dialogRef) return;
		if (dialogRef.open) {
			dialogRef.close();
		} else {
			dialogRef.show();
		}
	}
</script>

<div class="relative">
	<!-- Dialog -->
	<dialog
		bind:this={dialogRef}
		closedby="any"
		class="dialog preset-filled-surface-100-900 animate-dialog [--dialog-top:auto] [--dialog-left:50%] [--dialog-translate:-50%_0] bottom-full mb-2 whitespace-nowrap"
	>
		<p>This acts as a tooltip.</p>
	</dialog>

	<!-- Trigger -->
	<button class="btn preset-filled" onclick={toggle}>Toggle Dialog</button>
</div>

```

## Fullscreen

Add `dialog-fullscreen` to expand the dialog to the full viewport.

```svelte
<script lang="ts">
	let dialogRef: HTMLDialogElement;

	function showModal() {
		document.body.style.overflow = 'hidden';
		dialogRef?.showModal();
	}

	function closeModal() {
		dialogRef?.close();
	}

	function onClose() {
		document.body.style.overflow = '';
	}
</script>

<!-- Dialog -->
<dialog bind:this={dialogRef} onclose={onClose} class="dialog dialog-fullscreen preset-filled-surface-100-900 animate-dialog">
	<header>
		<h2 class="h3">Hello world!</h2>
	</header>
	<article>
		<p>This dialog expands to fill the entire viewport and locks page scrolling while open.</p>
	</article>
	<footer class="flex justify-end">
		<form method="dialog">
			<button type="button" class="btn preset-tonal" onclick={closeModal}>Close</button>
		</form>
	</footer>
</dialog>

<!-- Trigger -->
<button class="btn preset-filled" onclick={showModal}>Open Dialog</button>

```

## Animation

Add `animate-dialog` to opt into a fade transition for the dialog and its backdrop.

```svelte
<script lang="ts">
	let dialogRef: HTMLDialogElement;

	function showModal() {
		dialogRef?.showModal();
	}

	function closeModal() {
		dialogRef?.close();
	}
</script>

<!-- Dialog -->
<dialog bind:this={dialogRef} class="dialog animate-dialog preset-filled-surface-100-900">
	<header>
		<h2 class="h3">Hello world!</h2>
	</header>
	<article>
		<p>Opening and closing this dialog fades the surface and backdrop.</p>
	</article>
	<footer class="flex justify-end">
		<form method="dialog">
			<button type="button" class="btn preset-tonal" onclick={closeModal}>Close</button>
		</form>
	</footer>
</dialog>

<!-- Trigger -->
<button class="btn preset-filled" onclick={showModal}>Open Dialog</button>

```

## Interaction

### Light Dismiss

Set [`closedby="any"`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog#closedby) to allow the user to close the dialog by clicking the backdrop or pressing Esc.

```svelte
<script lang="ts">
	let dialogRef: HTMLDialogElement;

	function showModal() {
		dialogRef?.showModal();
	}

	function closeModal() {
		dialogRef?.close();
	}
</script>

<!-- Dialog -->
<dialog bind:this={dialogRef} closedby="any" class="dialog preset-filled-surface-100-900 animate-dialog">
	<header>
		<h2 class="h3">Click outside to close</h2>
	</header>
	<article>
		<p>This dialog supports light dismiss. Click the backdrop or press Esc to close.</p>
	</article>
	<footer class="flex justify-end">
		<form method="dialog">
			<button type="button" class="btn preset-tonal" onclick={closeModal}>Close</button>
		</form>
	</footer>
</dialog>

<!-- Trigger -->
<button class="btn preset-filled" onclick={showModal}>Open Dialog</button>

```

<details class="disclosure">
  <summary>⚠️ View Browser Support</summary>

  <div class="disclosure-content">
    \| Browser             | Minimum Version | Released      |
    \| ------------------- | --------------- | ------------- |
    \| Safari              | 18.2            | December 2024 |
    \| Safari on iOS       | 18.2            | December 2024 |
    \| Chrome              | 134             | March 2025    |
    \| Edge                | 134             | March 2025    |
    \| Chrome for Android  | 134             | March 2025    |
    \| Firefox             | 136             | March 2025    |
    \| Firefox for Android | 136             | March 2025    |
  </div>
</details>

### Result Handling

Wrap controls in a [`<form method="dialog">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog#usage_notes), then read each submit button's `value` from `dialog.returnValue` on [`close`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/close_event).

```svelte
<script lang="ts">
	let dialogRef: HTMLDialogElement;
	let result = $state('—');

	function showModal() {
		dialogRef?.showModal();
	}

	function onClose() {
		result = dialogRef.returnValue || '(dismissed)';
	}
</script>

<!-- Dialog -->
<dialog bind:this={dialogRef} onclose={onClose} class="dialog preset-filled-surface-100-900 animate-dialog">
	<header>
		<h2 class="h3">Confirm action</h2>
	</header>
	<article>
		<p>Submitting either button closes the dialog and exposes its value via the dialog's returnValue.</p>
	</article>
	<footer class="flex justify-end gap-2">
		<form method="dialog" class="flex gap-2">
			<button type="submit" value="cancel" class="btn preset-tonal">Cancel</button>
			<button type="submit" value="confirm" class="btn preset-filled">Confirm</button>
		</form>
	</footer>
</dialog>

<!-- Trigger -->
<div class="flex flex-col items-center gap-3">
	<button class="btn preset-filled" onclick={showModal}>Open Dialog</button>
	<p class="text-sm opacity-75">Last result: <code>{result}</code></p>
</div>

```

### Invoker Commands

Use the [Invoker Commands API](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog#modal_dialogs_using_invoker_commands) to control state with pure HTML.

```astro
<!-- Dialog -->
<dialog id="invoker-dialog" class="dialog preset-filled-surface-100-900 animate-dialog">
	<header>
		<h2 class="h3">Hello world!</h2>
	</header>
	<article>
		<p>This modal is controlled using HTML invoker commands &mdash; no JavaScript required.</p>
	</article>
	<footer class="flex justify-end">
		<button type="button" class="btn preset-tonal" command="close" commandfor="invoker-dialog">Close</button>
	</footer>
</dialog>

<!-- Trigger -->
<button type="button" class="btn preset-filled" command="show-modal" commandfor="invoker-dialog">Open Dialog</button>

```

<details class="disclosure">
  <summary>⚠️ View Browser Support</summary>

  <div class="disclosure-content">
    \| Browser             | Minimum Version | Released      |
    \| ------------------- | --------------- | ------------- |
    \| Chrome              | 135             | April 2025    |
    \| Edge                | 135             | April 2025    |
    \| Chrome for Android  | 135             | April 2025    |
    \| Firefox             | 144             | October 2025  |
    \| Firefox for Android | 144             | October 2025  |
    \| Safari              | 26.2            | December 2025 |
    \| Safari on iOS       | 26.2            | December 2025 |
  </div>
</details>

***

## Alternatives

Explore Skeleton's framework components for more advanced features and control:

* [Dialog](/docs/\[framework]/framework-components/dialog)
* [Popover](/docs/\[framework]/framework-components/popover)
* [Portal](/docs/\[framework]/framework-components/portal)

