import {createApp} from 'vue';
import {createPinia} from 'pinia';
import router from './router/index.js';
import App from './App.vue';
import './style.css';

if (import.meta.env.VITE_DEMO === '1') {
	const {installDemoMode} = await import('./composables/demoMode.js');
	installDemoMode();
}

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
