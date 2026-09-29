// Visible trace of every Prompt API call, so the audience can follow what the page does.

const MAX_ENTRIES = 100;
const list = document.querySelector('#log-list');

export function log(call, detail = '', { error = false } = {}) {
    const item = document.createElement('li');
    const time = document.createElement('time');
    time.textContent = new Date().toLocaleTimeString([], { hour12: false });

    const body = document.createElement('span');
    const code = document.createElement('code');
    code.textContent = call;
    if (error) code.classList.add('error');
    body.append(code);

    if (detail) {
        const info = document.createElement('span');
        info.className = 'detail';
        info.textContent = ` ${detail}`;
        body.append(info);
    }

    item.append(time, body);
    list.prepend(item);
    while (list.children.length > MAX_ENTRIES) list.lastElementChild.remove();
}

// Runs an async API call and logs its duration or the error it threw.
export async function timed(call, fn) {
    const start = performance.now();
    try {
        const result = await fn();
        log(call, `${Math.round(performance.now() - start)} ms`);
        return result;
    } catch (error) {
        log(call, `${error.name}: ${error.message}`, { error: true });
        throw error;
    }
}
