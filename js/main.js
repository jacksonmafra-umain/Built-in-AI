import { initTabs } from './lib/tabs.js';
import { initStatus } from './features/status.js';

initTabs();

initStatus({
    onReady() {
        document.querySelector('#panels').inert = false;
    },
});
