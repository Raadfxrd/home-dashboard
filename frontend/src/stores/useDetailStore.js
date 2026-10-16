import {defineStore} from 'pinia';
import {shallowRef} from 'vue';

/* What the detail panel is showing, and the element it grew out of so it
   can shrink back into it. */
export const useDetailStore = defineStore('detail', () => {
	const current = shallowRef(null); // {type, data, origin: HTMLElement|null}

	function open(type, data, event) {
		const origin = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		current.value = {type, data, origin};
	}

	function close() {
		current.value = null;
	}

	return {current, open, close};
});
