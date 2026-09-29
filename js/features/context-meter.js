import { contextOf, onContextOverflow } from '../lib/model.js';
import { log } from '../lib/log.js';

// Shows how much of the session's context window is used.
// https://developer.chrome.com/docs/ai/session-management
export function initContextMeter(chat) {
    const meter = document.querySelector('#context-meter');
    const label = document.querySelector('#context-label');
    const warning = document.querySelector('#context-warning');
    const watched = new WeakSet();

    chat.onChange(({ session }) => {
        const { used, total } = contextOf(session);
        meter.max = total || 1;
        meter.low = meter.max * 0.6;
        meter.high = meter.max * 0.8;
        meter.value = used;
        label.textContent = session
            ? `${used.toLocaleString()} / ${total.toLocaleString()} tokens (${total ? Math.round((used / total) * 100) : 0}%)`
            : 'No live session';
        warning.hidden = !session || !total || used / total < 0.8;

        if (session && !watched.has(session)) {
            watched.add(session);
            onContextOverflow(session, () => {
                warning.hidden = false;
                log('contextoverflow', 'oldest messages were dropped from the session', { error: true });
            });
        }
    });
}
