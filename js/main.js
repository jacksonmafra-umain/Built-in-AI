import { initTabs } from './lib/tabs.js';
import { initStatus } from './features/status.js';
import { initChat } from './features/chat.js';
import { initAttachments } from './features/attachments.js';
import { initContextMeter } from './features/context-meter.js';

initTabs();

initStatus({
    onReady(modalities) {
        const chat = initChat();
        initAttachments(chat, modalities);
        initContextMeter(chat);
        document.querySelector('#panels').inert = false;
    },
});
