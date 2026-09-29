import { initTabs } from './lib/tabs.js';
import { initStatus } from './features/status.js';
import { initChat } from './features/chat.js';

initTabs();

initStatus({
    onReady() {
        initChat();
        document.querySelector('#panels').inert = false;
    },
});
