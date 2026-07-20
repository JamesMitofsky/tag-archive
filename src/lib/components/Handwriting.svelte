<!--
	Static handwriting: renders recorded pen strokes as a graphite-textured SVG.
	Reused by the layout (top-left mark) and the home route (above the search).
	`filterId` must be unique per instance so multiple copies on one page don't
	share the same <filter> definition.
-->
<script lang="ts">
	interface Props {
		paths: string[];
		box: { x: number; y: number; width: number; height: number };
		filterId: string;
		class?: string;
		strokeWidth?: number;
	}

	let { paths, box, filterId, class: klass = '', strokeWidth = 3.5 }: Props = $props();
</script>

<svg
	class="pointer-events-none block text-[#14120f] {klass}"
	viewBox="{box.x} {box.y} {box.width} {box.height}"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- Graphite brush texture: rough the edges, then punch fine grain holes so
	     the stroke reads like pencil tooth instead of flat ink. -->
	<defs>
		<filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
			<!-- low-freq wobble = hand-drawn rough edge -->
			<feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="7" result="edge" />
			<feDisplacementMap in="SourceGraphic" in2="edge" scale="2.5" result="rough" />
			<!-- high-freq noise -> alpha mask = broken graphite coverage (paper tooth) -->
			<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain" />
			<feColorMatrix
				in="grain"
				type="matrix"
				values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.15"
				result="grainMask"
			/>
			<feComposite in="rough" in2="grainMask" operator="in" />
		</filter>
	</defs>
	<g filter="url(#{filterId})">
		{#each paths as d}
			<path {d} />
		{/each}
	</g>
</svg>
