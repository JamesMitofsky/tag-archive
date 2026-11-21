<!--
	The operator overlay for Archive Stream, shown on both the projector and
	the iPad: where this device's relay connection stands, and whether the
	other device is there. A page adds its own rows after these as children.

	It never shows the key, only a hint of it (see keyHint), so the two
	devices' keys can be compared without putting the key on a screen.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { keyHint, type RelayConfig, type RelayStatus } from './relay.ts';

	/** After this many failed attempts in a row, say the key is the likely cause. */
	const REFUSED_AFTER = 3;

	let {
		config,
		status,
		peerName,
		children
	}: {
		/** Null when the device has no relay URL or key to go on. */
		config: RelayConfig | null;
		status: RelayStatus | null;
		/** What to call the other device: "iPad" on the projector, "projector" on the iPad. */
		peerName: string;
		children?: Snippet;
	} = $props();

	const host = $derived.by(() => {
		if (!config) return null;
		try {
			return new URL(config.url).host;
		} catch {
			return config.url;
		}
	});
	const refused = $derived((status?.failures ?? 0) >= REFUSED_AFTER);
</script>

<dl class="operator">
	{#if !config}
		<dt>relay</dt>
		<dd>not set: open with ?key=… (and ?relay=… if PUBLIC_INSTALLATION_RELAY_URL isn't set)</dd>
	{:else}
		<dt>relay</dt>
		<dd>
			{status?.state ?? 'connecting'}
			{#if refused}
				· {status?.failures} failed tries: the key is likely wrong
			{/if}
		</dd>
		<dt>host</dt>
		<dd>{host}</dd>
		<dt>room</dt>
		<dd>{config.room}</dd>
		<dt>key</dt>
		<dd>{keyHint(config.key)}</dd>
		<dt>{peerName}</dt>
		<dd>{status?.peer ? 'here' : 'not heard from'}</dd>
		<dt>round trip</dt>
		<dd>{status?.rtt ?? '–'} ms</dd>
		<dt>messages</dt>
		<dd>{status?.rate ?? 0}/s in · {status?.sentRate ?? 0}/s out</dd>
	{/if}
	{@render children?.()}
</dl>

<style>
	.operator {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		display: grid;
		grid-template-columns: auto auto;
		gap: 0.15rem 0.75rem;
		max-width: calc(100vw - 2rem);
		margin: 0;
		padding: 0.75rem 1rem;
		font:
			0.8rem/1.3 ui-monospace,
			monospace;
		color: white;
		background: oklch(0.2 0.02 250 / 0.75);
		border-radius: 0.5rem;
		z-index: 5;
		pointer-events: none;
	}
	.operator :global(dd) {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
