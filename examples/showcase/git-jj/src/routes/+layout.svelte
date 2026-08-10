<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="h-dvh w-full overflow-hidden">
	{@render children()}
</div>
