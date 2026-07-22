import { mount } from 'svelte';
import './app.css';
import WidgetApp from './WidgetApp.svelte';

mount(WidgetApp, { target: document.getElementById('app') });
