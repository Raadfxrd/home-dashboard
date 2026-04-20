import {createRouter, createWebHistory} from 'vue-router';
import Dashboard from '../pages/Dashboard.vue';
import MediaLibrary from '../pages/MediaLibrary.vue';

const routes = [
	{path: '/', component: Dashboard},
	{path: '/media/:kind(movies|shows)', component: MediaLibrary},
];

export default createRouter({
	history: createWebHistory(),
	routes,
});
