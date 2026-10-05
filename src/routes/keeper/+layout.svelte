<script lang="ts">
	let { children } = $props();
</script>

<!-- Reserve the top band on mobile (`pt-chrome`, the same token that sizes it)
     where the home mark sits, so it never overlaps a control at the top of a
     keeper page — the settings button on the hub, any future header control.
     From md up this is plain breathing room again. -->
<div class="pt-chrome md:pt-8">
	{@render children()}
</div>
