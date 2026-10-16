import {onMounted, onUnmounted, ref} from 'vue';
import {get} from './useApi.js';

/**
 * Tracks whether anyone is using the page. After the timeout set in the
 * server's .env (IDLE_AFTER_MINUTES, default 5; 0 or "off" disables it)
 * without touch, mouse, keyboard or scrolling it reports idle; any of
 * those wakes it.
 *
 * ?idle=1 in the URL shortens the timeout to 5 seconds, to preview it.
 */
const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
const preview = typeof location !== 'undefined' && new URLSearchParams(location.search).get('idle') === '1';

export function useIdle() {
	const idle = ref(false);
	// Minutes, or null when the idle screen is off. Unknown until the server answers.
	const after = ref(null);
	let timer = null;
	let lastMove = {x: -1, y: -1};

	function arm() {
		clearTimeout(timer);
		if (!after.value) return;
		timer = setTimeout(() => (idle.value = true), preview ? 5000 : after.value * 60000);
	}

	function wake() {
		idle.value = false;
		arm();
	}

	function onActivity(event) {
		// A mouse resting on a table can still report tiny moves; ignore
		// anything under a few pixels so the screen doesn't keep waking.
		if (event.type === 'pointermove' && event.pointerType === 'mouse') {
			const moved = Math.abs(event.clientX - lastMove.x) + Math.abs(event.clientY - lastMove.y);
			lastMove = {x: event.clientX, y: event.clientY};
			if (moved < 6) return;
		}
		if (idle.value) {
			wake();
			return;
		}
		arm();
	}

	onMounted(async () => {
		for (const type of ACTIVITY) window.addEventListener(type, onActivity, {passive: true, capture: true});
		try {
			const config = await get('/config');
			after.value = config?.idleAfterMinutes ?? null;
		} catch {
			after.value = 5;
		}
		arm();
	});

	onUnmounted(() => {
		clearTimeout(timer);
		for (const type of ACTIVITY) window.removeEventListener(type, onActivity, {capture: true});
	});

	return {idle, after, wake};
}
