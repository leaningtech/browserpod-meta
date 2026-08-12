<script lang="ts">
	import { ICON_PATHS, type IconName } from './icons';

	let {
		name,
		size = 14,
		strokeWidth = 1.4,
		class: className = ''
	}: { name: IconName; size?: number; strokeWidth?: number; class?: string } = $props();
</script>

<svg
	viewBox="0 0 16 16"
	width={size}
	height={size}
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	class="shrink-0 {className}"
	aria-hidden="true"
>
	{#each ICON_PATHS[name] as d (d)}
		<path {d} />
	{/each}
</svg>
