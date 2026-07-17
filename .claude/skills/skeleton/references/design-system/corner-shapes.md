# Corner Shapes

Specifies the shape of a box's corners, within the area specified by its border-radius.

Based on the [corner-shape](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/corner-shape) CSS property. Pair `corner-shape-*` with a `rounded-*` utility on the same element.

```astro
---
const commonClasses = 'size-20 preset-filled rounded-xl text-xs font-medium grid place-items-center';
---

<div class="grid grid-cols-3 gap-4">
	<div class={`${commonClasses} corner-shape-round`}>round</div>
	<div class={`${commonClasses} corner-shape-bevel`}>bevel</div>
	<div class={`${commonClasses} corner-shape-notch`}>notch</div>
	<div class={`${commonClasses} corner-shape-scoop`}>scoop</div>
	<div class={`${commonClasses} corner-shape-squircle`}>squircle</div>
	<div class={`${commonClasses} corner-shape-straight`}>straight</div>
</div>

```

\| Class                   | Description                                 |
\| ----------------------- | ------------------------------------------- |
\| `corner-shape-round`    | Standard circular curve (default)           |
\| `corner-shape-bevel`    | Straight diagonal cut across the corner     |
\| `corner-shape-notch`    | Inverted bevel that carves into the corner  |
\| `corner-shape-scoop`    | Concave curve that scoops inward            |
\| `corner-shape-squircle` | Superellipse with a softer curve than round |
\| `corner-shape-straight` | Sharp 90° corner                            |
\| `corner-shape-none`     | Removes any shape property                  |

## Browser Support Warning

Currently available in a limited set of browsers. Follow progressive enhancement best practices when using it.

\| Browser            | Support              |
\| ------------------ | -------------------- |
\| Chrome             | 139+                 |
\| Edge               | 139+                 |
\| Firefox            | ⚠️ Not yet supported |
\| Safari             | ⚠️ Not yet supported |
\| Chrome for Android | 147+                 |
\| Safari on iOS      | ⚠️ Not yet supported |

## Individual Sides

Target each side and the adjacent corners, including: top, left, bottom, right.

```astro
---
const commonClasses = 'size-20 preset-filled text-xs font-medium grid place-items-center';
---

<div class="grid grid-cols-2 gap-4">
	<div class={`${commonClasses} rounded-t-xl corner-shape-t-bevel`}>-t-</div>
	<div class={`${commonClasses} rounded-r-xl corner-shape-r-bevel`}>-r-</div>
	<div class={`${commonClasses} rounded-b-xl corner-shape-b-bevel`}>-b-</div>
	<div class={`${commonClasses} rounded-l-xl corner-shape-l-bevel`}>-l-</div>
</div>

```

\| Class              | Description |
\| ------------------ | ----------- |
\| `corner-shape-t-*` | Top side    |
\| `corner-shape-r-*` | Right side  |
\| `corner-shape-b-*` | Bottom side |
\| `corner-shape-l-*` | Left side   |

## Individual Corners

Target a particular corner of an element.

```astro
---
const commonClasses = 'size-20 preset-filled text-xs font-medium grid place-items-center';
---

<div class="grid grid-cols-2 gap-4">
	<div class={`${commonClasses} rounded-tl-xl corner-shape-tl-bevel`}>-tl-</div>
	<div class={`${commonClasses} rounded-tr-xl corner-shape-tr-bevel`}>-tr-</div>
	<div class={`${commonClasses} rounded-br-xl corner-shape-br-bevel`}>-br-</div>
	<div class={`${commonClasses} rounded-bl-xl corner-shape-bl-bevel`}>-bl-</div>
</div>

```

\| Class               | Description         |
\| ------------------- | ------------------- |
\| `corner-shape-tl-*` | Top-left corner     |
\| `corner-shape-tr-*` | Top-right corner    |
\| `corner-shape-br-*` | Bottom-right corner |
\| `corner-shape-bl-*` | Bottom-left corner  |

## Logical Properties

Target sides and corners that flow with the document's writing direction. Sets automatically basedon LTR/RTL mode.

```astro
---
const commonClasses = 'size-20 preset-filled text-xs font-medium grid place-items-center';
---

<div class="grid grid-cols-2 gap-4">
	<div class={`${commonClasses} rounded-s-xl corner-shape-s-bevel`}>-s-</div>
	<div class={`${commonClasses} rounded-e-xl corner-shape-e-bevel`}>-e-</div>
	<div class={`${commonClasses} rounded-ss-xl corner-shape-ss-bevel`}>-ss-</div>
	<div class={`${commonClasses} rounded-se-xl corner-shape-se-bevel`}>-se-</div>
	<div class={`${commonClasses} rounded-ee-xl corner-shape-ee-bevel`}>-ee-</div>
	<div class={`${commonClasses} rounded-es-xl corner-shape-es-bevel`}>-es-</div>
</div>

```

\| Class               | Description        |
\| ------------------- | ------------------ |
\| `corner-shape-s-*`  | Inline-start side  |
\| `corner-shape-e-*`  | Inline-end side    |
\| `corner-shape-ss-*` | Start-start corner |
\| `corner-shape-se-*` | Start-end corner   |
\| `corner-shape-ee-*` | End-end corner     |
\| `corner-shape-es-*` | End-start corner   |

## Theme Variables

Canned variable default values defined via theme properties.

```astro
<div class="flex flex-col items-center gap-4">
	<!-- Base -->
	<button type="button" class="btn preset-filled corner-shape-base">base</button>
	<!-- Container -->
	<div class="card preset-filled corner-shape-container p-4">container</div>
</div>

```

\| Class                    | Theme Property                  | Role                               |
\| ------------------------ | ------------------------------- | ---------------------------------- |
\| `corner-shape-base`      | `var(--corner-shape-base)`      | Target small elements like buttons |
\| `corner-shape-container` | `var(--corner-shape-container)` | Target large elements like cards   |

## Arbitrary Syntax

Use the `corner-shape-[<value>]` syntax to set the corner shape based on a completely custom value.

```html
<div class="corner-shape-[squircle] rounded-2xl ...">
	<!-- ... -->
</div>
```

For CSS variables, you can also use the `corner-shape-(<custom-property>)` syntax.

```html
<div class="corner-shape-(--my-corner-shape) rounded-2xl ...">
	<!-- ... -->
</div>
```

## Global Theming

To apply a corner shape across a family of elements, target the class in your global stylesheet and pair it with a matching radius scale. This pattern is valid for any class or element has a `border-radius` applied.

```css
.btn,
.btn-icon,
.chip,
.chip-icon,
.badge,
.badge-icon {
	corner-shape: var(--corner-shape-base);
}
```

```css
.card {
	corner-shape: var(--corner-shape-container);
}
```

