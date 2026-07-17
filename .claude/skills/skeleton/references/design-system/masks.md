# Masks

Clip elements to a variety of decorative shapes using CSS mask-image.

```astro
<img class="mask mask-circle w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-squircle w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-triangle-up w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-triangle-down w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-triangle-right w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-triangle-left w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-diamond w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-pentagon w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-hexagon w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-cube w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-octagon w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-decagon w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-star w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-heart w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
<img class="mask mask-cross w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

## Shapes

Apply classes `mask mask-{shape}` with any of the shapes defined below.

### Circle

```astro
<img class="mask mask-circle w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Squircle

```astro
<img class="mask mask-squircle w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Triangle Up

```astro
<img class="mask mask-triangle-up w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Triangle Down

```astro
<img class="mask mask-triangle-down w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Triangle Right

```astro
<img class="mask mask-triangle-right w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Triangle Left

```astro
<img class="mask mask-triangle-left w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Diamond

```astro
<img class="mask mask-diamond w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Pentagon

```astro
<img class="mask mask-pentagon w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Hexagon

```astro
<img class="mask mask-hexagon w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Cube

```astro
<img class="mask mask-cube w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Octagon

```astro
<img class="mask mask-octagon w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Decagon

```astro
<img class="mask mask-decagon w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Star

```astro
<img class="mask mask-star w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Heart

```astro
<img class="mask mask-heart w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

### Cross

```astro
<img class="mask mask-cross w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />

```

## Custom Masks

Define your own custom shape. Any valid [CSS mask source](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/mask) will work.

```css
@utility mask-custom {
	mask-image: url('/path/to/your-shape.svg');
}
```

```html
<img class="mask mask-custom w-32" src="https://i.pravatar.cc/150?img=48" alt="Avatar" />
```

