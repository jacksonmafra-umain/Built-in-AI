import { log, timed } from '../lib/log.js';

// Multiple conversations: create, clone, free, delete, and restore after a reload.
// Native sessions live in memory only; the text history is kept in localStorage and
// replayed through `initialPrompts` when a freed or restored session is used again.
// https://developer.chrome.com/docs/ai/session-management

const STORAGE_KEY = 'built-in-ai-demo:sessions';

export function initSessions(chat) {
    const list = document.querySelector('#session-list');
    const newButton = document.querySelector('#session-new');
    const records = loadRecords();
    let activeId = null;
    let busy = false;

    function loadRecords() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
            if (saved.length) log('localStorage.getItem()', `restored ${saved.length} session(s)`);
            return saved.map((record) => ({ ...record, session: null }));
        } catch {
            return [];
        }
    }

    function save() {
        try {
            const data = records.map(({ id, name, history, systemPrompt }) => ({ id, name, history, systemPrompt }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch {
            // Storage can be blocked or full; sessions still work for this page view.
        }
    }

    function createRecord(fields = {}) {
        const record = {
            id: crypto.randomUUID(),
            name: `Session ${records.length + 1}`,
            session: null,
            history: [],
            systemPrompt: chat.state.systemPrompt ?? chat.defaultSystemPrompt,
            ...fields,
        };
        records.unshift(record);
        return record;
    }

    function activate(record) {
        activeId = record.id;
        chat.load(record);
    }

    function destroy(record, reason) {
        if (!record.session) return;
        record.session.destroy();
        record.session = null;
        log('session.destroy()', reason);
    }

    async function clone(record) {
        const session = record.session ? await timed('session.clone()', () => record.session.clone()) : null;
        activate(
            createRecord({
                name: `${record.name} (clone)`,
                session,
                history: structuredClone(record.history),
                systemPrompt: record.systemPrompt,
            }),
        );
    }

    function remove(record) {
        destroy(record, `deleted "${record.name}"`);
        records.splice(records.indexOf(record), 1);
        if (record.id === activeId) activate(records[0] ?? createRecord());
        else render();
        save();
    }

    function button(text, onClick, { className = '', disabled = false } = {}) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = className;
        element.textContent = text;
        element.disabled = busy || disabled;
        element.addEventListener('click', (event) => {
            event.stopPropagation();
            onClick();
        });
        return element;
    }

    function render() {
        newButton.disabled = busy;
        list.replaceChildren(
            ...records.map((record) => {
                const item = document.createElement('li');
                item.className = 'session';
                item.ariaCurrent = record.id === activeId ? 'true' : null;

                const select = document.createElement('button');
                select.type = 'button';
                select.className = 'session-select';
                select.disabled = busy;
                select.addEventListener('click', () => activate(record));

                const name = document.createElement('span');
                name.className = 'session-name';
                name.textContent = record.name;
                const meta = document.createElement('span');
                meta.className = 'session-meta';
                meta.textContent = `${record.history.length} messages · ${record.session ? 'live' : 'saved'}`;
                select.append(name, meta);

                const actions = document.createElement('div');
                actions.className = 'session-actions';
                actions.append(
                    button('Clone', () => clone(record)),
                    button(
                        'Free',
                        () => {
                            destroy(record, `freed "${record.name}", history kept`);
                            if (record.id === activeId) chat.load(record);
                            else render();
                        },
                        { disabled: !record.session },
                    ),
                    button('Delete', () => remove(record), { className: 'danger' }),
                );

                item.append(select, actions);
                return item;
            }),
        );
    }

    chat.onChange((state) => {
        busy = state.busy;
        const record = records.find(({ id }) => id === activeId);
        if (record) {
            record.session = state.session;
            record.history = state.history;
            record.systemPrompt = state.systemPrompt;
            const firstQuestion = state.history.find(({ role }) => role === 'user')?.content;
            if (/^Session \d+$/.test(record.name) && firstQuestion) record.name = firstQuestion.slice(0, 40);
            save();
        }
        render();
    });

    newButton.addEventListener('click', () => activate(createRecord()));

    activate(records[0] ?? createRecord());
}
