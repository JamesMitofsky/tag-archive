<script lang="ts">
	let { children } = $props();
</script>

<!-- Clear the fixed frosted strip on mobile (`pt-chrome`, same token that sizes
     it) so nothing at the top of a keeper page — the settings button on the hub,
     any future header control — can be painted over by it. The strip is
     `md:hidden`, so from md up this is plain breathing room again. -->
<div class="pt-chrome md:pt-8">
	{@render children()}
</div>
