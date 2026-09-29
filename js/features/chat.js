import { createSession } from '../lib/model.js';
import { log, timed } from '../lib/log.js';

const DEFAULT_SYSTEM_PROMPT = 'You are a concise, friendly assistant for a software team. Keep answers short.';

// Streaming chat against a single `LanguageModel` session.
// Other features plug in through the returned controller.
export function initChat() {
    const form = document.querySelector('#chat-form');
    const input = document.querySelector('#chat-input');
    const sendButton = document.querySelector('#chat-send');
    const stopButton = document.querySelector('#chat-stop');
    const messages = document.querySelector('#chat-messages');
    const systemPromptInput = document.querySelector('#system-prompt');
    systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;

    const listeners = new Set();
    const modalities = new Set(['text']);
    const contentProviders = [];

    let session = null;
    let history = [];
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    let controller = null;

    function emit() {
        const state = { session, history, systemPrompt, busy: Boolean(controller) };
        for (const listener of listeners) listener(state);
    }

    // History is plain text so it can be replayed into a fresh session through `initialPrompts`.
    function buildInitialPrompts() {
        return [
            { role: 'system', content: systemPrompt },
            ...history.map(({ role, content, attachments }) => ({
                role,
                content: attachments?.length ? `${content}\n[Attached: ${attachments.join(', ')}]` : content,
            })),
        ];
    }

    async function ensureSession() {
        if (session) return session;
        systemPrompt = systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT;
        session = await timed('LanguageModel.create()', () =>
            createSession({ modalities: [...modalities], initialPrompts: buildInitialPrompts() }),
        );
        emit();
        return session;
    }

    function renderMessage({ role, content, attachments }) {
        const item = document.createElement('li');
        item.className = `message ${role}`;
        const text = document.createElement('div');
        text.className = 'message-text';
        text.textContent = content;
        item.append(text);
        if (attachments?.length) {
            const meta = document.createElement('div');
            meta.className = 'message-meta';
            meta.textContent = `Attached: ${attachments.join(', ')}`;
            item.append(meta);
        }
        return item;
    }

    function render() {
        messages.replaceChildren(...history.map(renderMessage));
        messages.scrollTop = messages.scrollHeight;
    }

    function setBusy(busy) {
        sendButton.disabled = busy;
        stopButton.disabled = !busy;
        emit();
    }

    async function send() {
        const text = input.value.trim();
        const parts = contentProviders.flatMap((provider) => provider.collect());
        if (!text && !parts.length) return;

        controller = new AbortController();
        setBusy(true);

        // Create the session before recording the new turn, so it is not replayed twice.
        let active;
        try {
            active = await ensureSession();
        } catch (error) {
            messages.append(renderMessage({ role: 'error', content: `Could not create a session: ${error.message}` }));
            controller = null;
            setBusy(false);
            return;
        }

        const userMessage = {
            role: 'user',
            content: text,
            attachments: parts.map((part) => part.type),
        };
        history.push(userMessage);
        messages.append(renderMessage(userMessage));
        input.value = '';

        const reply = renderMessage({ role: 'assistant', content: '' });
        reply.classList.add('streaming');
        messages.append(reply);
        const replyText = reply.querySelector('.message-text');

        let answer = '';
        try {
            const content = [...(text ? [{ type: 'text', value: text }] : []), ...parts];
            const start = performance.now();
            const stream = active.promptStreaming([{ role: 'user', content }], { signal: controller.signal });
            for await (const chunk of stream) {
                answer += chunk;
                replyText.textContent = answer;
                messages.scrollTop = messages.scrollHeight;
            }
            log('session.promptStreaming()', `${Math.round(performance.now() - start)} ms`);
        } catch (error) {
            if (error.name === 'AbortError') {
                answer += answer ? ' [stopped]' : '[stopped]';
                log('AbortController.abort()', 'generation stopped by user');
            } else {
                log('session.promptStreaming()', `${error.name}: ${error.message}`, { error: true });
                reply.classList.add('error');
                answer = `Error: ${error.message}`;
            }
            replyText.textContent = answer;
        } finally {
            reply.classList.remove('streaming');
            controller = null;
            setBusy(false);
            for (const provider of contentProviders) provider.clear();
            if (!reply.classList.contains('error')) history.push({ role: 'assistant', content: answer });
            emit();
            input.focus();
        }
    }

    function load(state) {
        session = state.session ?? null;
        history = state.history ?? [];
        systemPrompt = state.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
        systemPromptInput.value = systemPrompt;
        render();
        emit();
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        send();
    });

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            if (!controller) send();
        }
    });

    stopButton.addEventListener('click', () => controller?.abort());

    setBusy(false);

    return {
        defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
        get state() {
            return { session, history, systemPrompt, busy: Boolean(controller), modalities: [...modalities] };
        },
        load,
        buildInitialPrompts,
        onChange(listener) {
            listeners.add(listener);
        },
        // Registers extra prompt content (images, audio). Must run before the first session is created.
        addContentProvider(type, provider) {
            modalities.add(type);
            contentProviders.push(provider);
        },
    };
}
