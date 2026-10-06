<script lang="ts">
	// iOS 26 Safari clips position:fixed content to the area between its bars,
	// so Sky's paper never reaches the status-bar inset or the strip behind the
	// floating toolbar. What shows there is the page itself — the cards and,
	// between them, whatever is underneath — under Safari's soft blur. This puts
	// the sky's end colours underneath at those edges: the zenith above
	// mid-screen and the horizon below it, kept centred on the screen as the
	// page scrolls. The two meet behind the paper, out of sight, so the seam can
	// trail a fling by half a screen before either edge could show it.
	//
	// Deliberately NOT fixed or sticky. Safari turns a fixed or sticky element at
	// a screen edge into an opaque colour bar (see Sky.svelte) and clips it like
	// the paper. Plain scrolling content is neither sampled nor clipped.
	function followScroll(node: HTMLElement) {
		// iOS WebKit only; elsewhere the CSS hides the underlay.
		if (!CSS.supports('-webkit-touch-callout', 'none')) return;
		const follow = () => node.style.setProperty('--scroll-y', `${window.scrollY}px`);
		follow();
		// Scroll events are dispatched in the rendering update, before
		// requestAnimationFrame callbacks, so this write lands in the same frame;
		// batching it through rAF would only add one.
		addEventListener('scroll', follow, { passive: true });
		addEventListener('pageshow', follow);
		return {
			destroy() {
				removeEventListener('scroll', follow);
				removeEventListener('pageshow', follow);
			}
		};
	}
</script>

<div class="sky-underlay" aria-hidden="true" use:followScroll>
	<div class="half zenith"></div>
	<div class="half horizon"></div>
</div>

<style>
	.sky-underlay {
		display: none;
	}

	@supports (-webkit-touch-callout: none) {
		/* Spans the document (.route-wrap is its containing block) and clips to
		   it, so the halves riding along never make the page longer. Beneath the
		   paper (-z-10) and clouds (-z-5): it only shows where they cannot reach. */
		.sky-underlay {
			display: block;
			position: absolute;
			inset: 0;
			z-index: -20;
			overflow: clip;
			pointer-events: none;
		}

		/* A plain colour and nothing else, on its own compositing layer. WebKit
		   draws that as a solid-colour layer with no bitmap
		   (RenderLayerBacking::updateDirectlyCompositedBackgroundColor), so
		   following the scroll moves a layer and never repaints, however long the
		   page. Two large screens each way. */
		.half {
			position: absolute;
			left: 0;
			right: 0;
			height: 200lvh;
			transform: translateY(var(--scroll-y, 0px));
			will-change: transform;
		}
		.zenith {
			top: calc(50svh - 200lvh);
			background-color: var(--sky-0);
		}
		.horizon {
			top: 50svh;
			background-color: var(--sky-2);
		}
	}
</style>
