import {onMounted, onUnmounted, ref, watch} from 'vue';

/**
 * Tracks whether anyone is using the page. After `minutes` without touch,
 * mouse, keyboard or scrolling it reports idle; any of those wakes it.
 * The chosen timeout is remembered per browser ('off' disables it).
 *
 * ?idle=1 in the URL shortens every timeout to 5 seconds, to preview it.
 */
const KEY = 'dashboard.idleAfter';
const OPTIONS = ['2', '5', '10', 'off'];
const ACTIVITY = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
const preview = typeof location !== 'undefined' && new URLSearchParams(location.search).get('idle') === '1';

function readSetting() {
	try {
		const value = localStorage.getItem(KEY);
		return OPTIONS.includes(value) ? value : '5';
	} catch {
		return '5';
	}
}

export function useIdle() {
	const idle = ref(false);
	const after = ref(readSetting());
	let timer = null;
	let lastMove = {x: -1, y: -1};

	function timeoutMs() {
		if (after.value === 'off') return null;
		return preview ? 5000 : Number(after.value) * 60000;
	}

	function arm() {
		clearTimeout(timer);
		const ms = timeoutMs();
		if (ms) timer = setTimeout(() => (idle.value = true), ms);
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

	watch(after, (value) => {
		try {
			localStorage.setItem(KEY, value);
		} catch {
			// Storage blocked: the choice lasts until the page reloads.
		}
		if (value === 'off') idle.value = false;
		arm();
	});

	onMounted(() => {
		for (const type of ACTIVITY) window.addEventListener(type, onActivity, {passive: true, capture: true});
		arm();
	});

	onUnmounted(() => {
		clearTimeout(timer);
		for (const type of ACTIVITY) window.removeEventListener(type, onActivity, {capture: true});
	});

	return {idle, after, wake, options: OPTIONS};
}
