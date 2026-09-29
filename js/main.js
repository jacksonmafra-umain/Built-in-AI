import { initTabs } from './lib/tabs.js';
import { initBackdrop } from './lib/backdrop.js';
import { initDisplay } from './features/display.js';
import { initStatus } from './features/status.js';
import { initChat } from './features/chat.js';
import { initAttachments } from './features/attachments.js';
import { initContextMeter } from './features/context-meter.js';
import { initSessions } from './features/sessions.js';
import { initCompacting } from './features/compacting.js';
import { initStructured } from './features/structured.js';

const backdrop = initBackdrop(document.querySelector('#backdrop'));
initDisplay(backdrop);
initTabs();

initStatus({
    onReady(modalities) {
        const chat = initChat();
        initAttachments(chat, modalities);
        initContextMeter(chat);
        initCompacting(chat);
        initSessions(chat);
        initStructured();
        document.querySelector('#panels').inert = false;
    },
});
