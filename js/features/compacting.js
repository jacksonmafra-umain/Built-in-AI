import { contextOf, createSession } from '../lib/model.js';
import { log, timed } from '../lib/log.js';

// Session compacting: summarize older turns, then start a fresh session seeded with the
// summary plus the latest exchange, so a long chat keeps its meaning with fewer tokens.
// https://developer.chrome.com/docs/ai/session-compacting

const KEEP_RECENT = 2;

function toTranscript(history) {
    const labels = { user: 'User', assistant: 'Assistant', summary: 'Earlier summary' };
    return history.map(({ role, content }) => `${labels[role] ?? role}: ${content}`).join('\n');
}

// Prefers the Summarizer API when it is ready; otherwise asks a throwaway Prompt API session.
async function summarize(transcript) {
    if ('Summarizer' in self) {
        const options = {
            type: 'tldr',
            format: 'plain-text',
            length: 'medium',
            expectedInputLanguages: ['en'],
            outputLanguage: 'en',
        };
        try {
            if ((await Summarizer.availability(options)) === 'available') {
                const summarizer = await timed('Summarizer.create()', () => Summarizer.create(options));
                try {
                    return await timed('summarizer.summarize()', () =>
                        summarizer.summarize(transcript, {
                            context: 'A chat between a user and an assistant. Keep facts, names, decisions and open questions.',
                        }),
                    );
                } finally {
                    summarizer.destroy();
                }
            }
        } catch {
            log('Summarizer', 'failed, falling back to the Prompt API', { error: true });
        }
    }

    const helper = await timed('LanguageModel.create() [summarizer]', () =>
        createSession({
            initialPrompts: [
                {
                    role: 'system',
                    content: 'You compress chat transcripts. Keep facts, names, decisions and open questions. Reply with the summary only.',
                },
            ],
        }),
    );
    try {
        return await timed('session.prompt() [summarize]', () =>
            helper.prompt(`Summarize this conversation in at most 120 words:\n\n${transcript}`),
        );
    } finally {
        helper.destroy();
    }
}

export function initCompacting(chat) {
    const button = document.querySelector('#compact');
    const result = document.querySelector('#compact-result');
    let running = false;

    function update({ session, history, busy }) {
        button.disabled = running || busy || !session || history.length <= KEEP_RECENT;
    }

    chat.onChange(update);

    button.addEventListener('click', async () => {
        const { session, history, systemPrompt } = chat.state;
        const before = contextOf(session).used;
        running = true;
        update(chat.state);
        result.textContent = 'Compacting…';

        try {
            const summary = await summarize(toTranscript(history.slice(0, -KEEP_RECENT)));
            chat.load({
                session: null,
                history: [{ role: 'summary', content: summary.trim() }, ...history.slice(-KEEP_RECENT)],
                systemPrompt,
            });
            session.destroy();
            log('session.destroy()', 'replaced by compacted session');
            const after = contextOf(await chat.ensureSession()).used;
            result.textContent = `Compacted ${before.toLocaleString()} → ${after.toLocaleString()} tokens.`;
            log('compacted', `${before} → ${after} tokens`);
        } catch (error) {
            result.textContent = `Compacting failed: ${error.message}`;
        } finally {
            running = false;
            update(chat.state);
        }
    });
}
