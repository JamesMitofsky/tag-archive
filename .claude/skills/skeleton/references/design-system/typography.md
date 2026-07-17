# Typography

The Skeleton typography system.

Skeleton provides an array of opt-in utility classes for common typographic elements, as well as a fully functional typography scale based on theme settings, with guidance on crafting a custom semantic typography set tailored for your project's individual needs.

## Global Styles

The default base typography styles are applied as [globals](/docs/design/globals).

## Native Element Styles

Skeleton provides the following utility classes for styling semantic native HTML elements. All styles are opt-in by default, providing an escape hatch when you need to break from convention.

### Headings

Represents six levels of section headings.

```astro
<div class="space-y-4">
	<h1 class="h1">Heading 1</h1>
	<h2 class="h2">Heading 2</h2>
	<h3 class="h3">Heading 3</h3>
	<h4 class="h4">Heading 4</h4>
	<h5 class="h5">Heading 5</h5>
	<h6 class="h6">Heading 6</h6>
</div>

```

### Paragraphs

Represents a block of running text.

```astro
<p>The quick brown fox jumps over the lazy dog</p>

```

### Anchor

Creates a hyperlink to other pages, files, or locations within the same page.

```astro
<a href="/" class="anchor">Anchor</a>

```

### Pre-Formatted

Displays preformatted text exactly as written, preserving whitespace and line breaks.

```astro
<pre class="pre">The quick brown fox jumps over the lazy dog.</pre>

```

### Code

Displays an inline fragment of computer code. Provides support for [Presets](/docs/\[framework]/tailwind-utilities/presets).

```astro
<div class="space-y-4">
	<p>Use <code class="code">.code</code> to highlight partials.</p>
	<hr class="hr" />
	<p>Use <code class="code preset-filled-primary-500">.code</code> to highlight partials.</p>
	<p>Use <code class="code preset-filled-secondary-500">.code</code> to highlight partials.</p>
	<p>Use <code class="code preset-filled-tertiary-500">.code</code> to highlight partials.</p>
</div>

```

### Keyboard

Represents textual user input from a keyboard, voice, or other input device.

```astro
<div class="flex flex-col items-center gap-4">
	<div>Press <kbd class="kbd">⌘</kbd> + <kbd class="kbd">c</kbd> to copy.</div>

	<hr class="hr" />

	<div class="space-y-1">
		<div class="flex w-full justify-center gap-1">
			<kbd class="kbd">q</kbd>
			<kbd class="kbd">w</kbd>
			<kbd class="kbd">e</kbd>
			<kbd class="kbd">r</kbd>
			<kbd class="kbd">t</kbd>
			<kbd class="kbd">y</kbd>
			<kbd class="kbd">u</kbd>
			<kbd class="kbd">i</kbd>
			<kbd class="kbd">o</kbd>
			<kbd class="kbd">p</kbd>
		</div>
		<div class="flex w-full justify-center gap-1">
			<kbd class="kbd">a</kbd>
			<kbd class="kbd">s</kbd>
			<kbd class="kbd">d</kbd>
			<kbd class="kbd">f</kbd>
			<kbd class="kbd">g</kbd>
			<kbd class="kbd">h</kbd>
			<kbd class="kbd">j</kbd>
			<kbd class="kbd">k</kbd>
			<kbd class="kbd">l</kbd>
		</div>
		<div class="flex w-full justify-center gap-1">
			<kbd class="kbd">z</kbd>
			<kbd class="kbd">x</kbd>
			<kbd class="kbd">c</kbd>
			<kbd class="kbd">v</kbd>
			<kbd class="kbd">b</kbd>
			<kbd class="kbd">n</kbd>
			<kbd class="kbd">m</kbd>
		</div>
	</div>
</div>

```

### Insert & Delete

Marks text that has been added to or removed from a document.

```astro
<div class="w-full">
	<del class="del"><s>Always</s> Gonna Give You Up</del>
	<ins class="ins" cite="https://youtu.be/dQw4w9WgXcQ" datetime="10-31-2022"> Never Gonna Give You Up </ins>
</div>

```

### Abbreviation

Represents an abbreviation or acronym, optionally paired with its full expansion.

```astro
<p>
	The <abbr class="abbr" title="HyperText Markup Language">HTML</abbr> standard is maintained by the
	<abbr class="abbr" title="World Wide Web Consortium">W3C</abbr>.
</p>

```

### Blockquotes

Indicates an extended quotation set apart from surrounding content.

```astro
<blockquote class="blockquote">
	<p>
		"The only way to do great work is to love what you do. If you haven't found it yet, keep looking. Don't settle. As with all matters of
		the heart, you'll know when you find it. And, like any great relationship, it just gets better and better as the years roll on."
	</p>
	<cite class="cite">&mdash; Steve Jobs</cite>
</blockquote>

```

### Citation

References the title of a creative work, such as a book, article, or film.

```astro
<p>
	One of the most influential novels of the 20th century is
	<cite class="cite"><a class="anchor" href="https://en.wikipedia.org/wiki/The_Great_Gatsby">The Great Gatsby</a></cite>
	by F. Scott Fitzgerald, often studied alongside <cite class="cite">To Kill a Mockingbird</cite>.
</p>

```

### Mark

Highlights text of relevance or importance within the surrounding context.

```astro
<p>
	The quick brown <mark class="mark">fox</mark> jumps over the lazy <mark class="mark">dog</mark>.
</p>

```

### Quotation

Represents a short inline quotation.

```astro
<p>The lead said, <q class="quote">we ship when ready</q>.</p>

```

### Subscript

Renders text in subscript, typically lowered and reduced in size.

```astro
<p>The chemical formula for water is H<sub class="sub">2</sub>O, and table salt is Na<sub class="sub">1</sub>Cl<sub class="sub">1</sub>.</p>

```

### Superscript

Renders text in superscript, typically raised and reduced in size.

```astro
<p>
	Einstein's mass-energy equivalence is expressed as E = mc<sup class="sup">2</sup>, and the area of a circle is &pi;r<sup class="sup"
		>2</sup
	>.
</p>

```

### Time

Represents a specific period in time or a machine-readable date.

```astro
<p>
	Apollo 11 landed on the Moon on <time class="time" datetime="1969-07-20">July 20, 1969</time>.
</p>

```

### Lists

Represents ordered and unordered lists of items. Skeleton defers to Tailwind's built-in utility classes for common list styles.

```astro
<div class="w-full space-y-4">
	<!-- Basic List -->
	<section class="space-y-4">
		<p class="text-lg font-bold">Basic List</p>
		<ul class="list-inside list-none space-y-2">
			<li>Skeleton is an adaptive design system powered by the Tailwind CSS framework.</li>
			<li>Compatible with Svelte, React, Astro, and many other popular frameworks.</li>
			<li>Theming is driven by CSS custom properties for quick color customization.</li>
		</ul>
	</section>

	<hr class="hr" />

	<!-- Unordered List -->
	<section class="space-y-4">
		<p class="text-lg font-bold">Unordered List</p>
		<ul class="list-inside list-disc space-y-2">
			<li>Skeleton is an adaptive design system powered by the Tailwind CSS framework.</li>
			<li>Compatible with Svelte, React, Astro, and many other popular frameworks.</li>
			<li>Theming is driven by CSS custom properties for quick color customization.</li>
		</ul>
	</section>

	<hr class="hr" />

	<!-- Ordered List -->
	<section class="space-y-4">
		<p class="text-lg font-bold">Ordered List</p>
		<ol class="list-inside list-decimal space-y-2">
			<li>Skeleton is an adaptive design system powered by the Tailwind CSS framework.</li>
			<li>Compatible with Svelte, React, Astro, and many other popular frameworks.</li>
			<li>Theming is driven by CSS custom properties for quick color customization.</li>
		</ol>
	</section>

	<hr class="hr" />

	<!-- Description List -->
	<section class="space-y-4">
		<p class="text-lg font-bold">Description List</p>
		<dl class="space-y-2">
			<div>
				<dt class="font-bold">Item A</dt>
				<dd class="opacity-60">Skeleton is an adaptive design system powered by the Tailwind CSS framework.</dd>
			</div>
			<div>
				<dt class="font-bold">Item B</dt>
				<dd class="opacity-60">Compatible with Svelte, React, Astro, and many other popular frameworks.</dd>
			</div>
			<div>
				<dt class="font-bold">Item C</dt>
				<dd class="opacity-60">Theming is driven by CSS custom properties for quick color customization.</dd>
			</div>
		</dl>
	</section>

	<hr class="hr" />

	<!-- Navigation List -->
	<nav class="space-y-2">
		<!-- Optional Heading -->
		<p class="text-lg font-bold">Navigation List</p>
		<!-- / -->
		<ul class="space-y-2">
			<li>
				<a class="anchor" href="#">Home</a>
			</li>
			<li>
				<a class="anchor" href="#">About</a>
			</li>
			<li>
				<a class="anchor" href="#">Blog</a>
			</li>
		</ul>
	</nav>
</div>

```

## Advanced Features

The following features are optional and intended for professionals with moderate understanding of web-based typography. If you're unfamiliar with these concepts, feel free to skip them and use the friendly defaults Skeleton provides out of the box.

### Typographic Scale

Skeleton augments [Tailwind's font-size](https://tailwindcss.com/docs/font-size) utilities to support a customizable [Typographic Scale](https://designcode.io/typographic-scales). Put simply, by modifying your theme's `--text-scaling` property, you can control the overall scale of text sizing globally throughout your application. See the [Core API](/docs/get-started/core-api#typography) to review the scaling formula.

<Preview client:visible>
  <Typescale client:visible />
</Preview>

> TIP: the base scale size is `1.0` for `100%`

### Semantic Typography

When working with a designer, they may craft a semantic set of typography for your project. These might include semantic names, canned sizes, and pre-configured styling. To handle this in Skeleton, we recommend following best practices for [User Generated Presets](/docs/\[framework]/tailwind-utilities/presets#user-generated), while mixing CSS primitives with semantic HTML elements to replicate all required styles.

We've provided a boilerplate below to help you get started. Implement in your global stylesheet, and customize as needed.

```svelte
<div class="table-wrap">
	<table class="table">
		<thead>
			<tr>
				<th>Class</th>
				<th>Preview</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<td><code class="code">preset-typo-display-4</code></td>
				<td><h1 class="preset-typo-display-4">Aa</h1></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-display-3</code></td>
				<td><h2 class="preset-typo-display-3">Aa</h2></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-display-2</code></td>
				<td><h3 class="preset-typo-display-2">Aa</h3></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-display-1</code></td>
				<td><h4 class="preset-typo-display-1">Aa</h4></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-headline</code></td>
				<td><p class="preset-typo-headline">Headline</p></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-title</code></td>
				<td><p class="preset-typo-title">Title</p></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-subtitle</code></td>
				<td><p class="preset-typo-subtitle">Subtitle</p></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-body-1</code></td>
				<td>
					<p class="preset-typo-body-1">Body 1</p>
				</td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-body-2</code></td>
				<td>
					<p class="preset-typo-body-2">Body 2</p>
				</td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-caption</code></td>
				<td><span class="preset-typo-caption">Caption</span></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-menu</code></td>
				<td><span class="preset-typo-menu">Menu</span></td>
			</tr>
			<!-- --- -->
			<tr>
				<td><code class="code">preset-typo-button</code></td>
				<td><span class="preset-typo-button">Button</span></td>
			</tr>
		</tbody>
	</table>
</div>

<style>
	/* IGNORE THIS: this is only required for our example <style> block. */
	/* https://tailwindcss.com/docs/functions-and-directives#reference-directive */
	@reference "../../../../app.css";

	/*
		In a real world project, copy the following into your global stylesheet.
		Then rename, adjust the styles, and otherwise modify as desired.

		For a quick reference for these theme variables, see the Core API:
		http://skeleton.dev/docs/get-started/core-api#typography
	*/

	/* Headings */
	.preset-typo-display-4,
	.preset-typo-display-3,
	.preset-typo-display-2,
	.preset-typo-display-1,
	.preset-typo-headline,
	.preset-typo-title,
	.preset-typo-subtitle,
	.preset-typo-caption,
	.preset-typo-menu,
	.preset-typo-button {
		color: var(--typo-heading--color-light);
		font-family: var(--typo-heading--font-family);
		font-weight: var(--typo-heading--font-weight);
		@variant dark {
			color: var(--typo-heading--color-dark);
		}
	}

	/* Body */
	.preset-typo-body-1,
	.preset-typo-body-2,
	.preset-typo-caption,
	.preset-typo-menu,
	.preset-typo-button {
		color: var(--typo-heading--color-light);
		@variant dark {
			color: var(--typo-heading--color-dark);
		}
	}

	/* Unique Properties */
	.preset-typo-display-4 {
		font-size: var(--text-7xl);
		@variant lg {
			font-size: var(--text-9xl);
		}
	}
	.preset-typo-display-3 {
		font-size: var(--text-6xl);
		@variant lg {
			font-size: var(--text-8xl);
		}
	}
	.preset-typo-display-2 {
		font-size: var(--text-5xl);
		@variant lg {
			font-size: var(--text-7xl);
		}
	}
	.preset-typo-display-1 {
		font-size: var(--text-4xl);
		@variant lg {
			font-size: var(--text-6xl);
		}
	}
	.preset-typo-headline {
		font-size: var(--text-2xl);
		@variant lg {
			font-size: var(--text-4xl);
		}
	}
	.preset-typo-title {
		font-size: var(--text-xl);
		@variant lg {
			font-size: var(--text-3xl);
		}
	}
	.preset-typo-subtitle {
		font-size: var(--text-base);
		font-family: var(--typo-heading--font-family);
		color: var(--color-surface-700-300);
		@variant lg {
			font-size: var(--text-xl);
		}
	}
	.preset-typo-body-1 {
		font-size: var(--text-xl);
		@variant lg {
			font-size: var(--text-3xl);
		}
	}
	.preset-typo-body-2 {
		font-size: var(--text-lg);
		@variant lg {
			font-size: var(--text-xl);
		}
	}
	.preset-typo-caption {
		font-size: var(--text-sm);
		color: var(--color-surface-700-300);
	}
	.preset-typo-menu {
		font-weight: bold;
	}
	.preset-typo-button {
		font-weight: bold;
	}
</style>

```

## Core API

For more information on theme properties, please refer to the [Core API](/docs/\[framework]/get-started/core-api) documentation.

