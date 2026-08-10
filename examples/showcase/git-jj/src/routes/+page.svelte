<script lang="ts">
	/** Two screens, one session. The pod stays booted between clones. */
	import CloneScreen from '$lib/components/CloneScreen.svelte';
	import Workbench from '$lib/components/Workbench.svelte';
	import { Session } from '$lib/session.svelte';

	const session = new Session();
	let view = $state<'clone' | 'edit'>('clone');
</script>

{#if view === 'edit' && session.ready}
	<Workbench
		{session}
		onLeave={() => {
			session.release();
			view = 'clone';
		}}
	/>
{:else}
	<div class="h-full overflow-y-auto">
		<CloneScreen {session} onOpen={() => (view = 'edit')} />
	</div>
{/if}
