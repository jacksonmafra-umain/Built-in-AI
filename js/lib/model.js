// Thin wrapper around the Prompt API (`LanguageModel`).
// https://developer.chrome.com/docs/ai/prompt-api

// The built-in model currently supports en, ja, es, de and fr. Declaring the languages up front
// lets Chrome reject unsupported combinations before any tokens are spent.
const LANGUAGES = ['en'];

export function isSupported() {
    return 'LanguageModel' in self;
}

export function optionsFor(modalities = ['text']) {
    return {
        expectedInputs: modalities.map((type) => (type === 'text' ? { type, languages: LANGUAGES } : { type })),
        expectedOutputs: [{ type: 'text', languages: LANGUAGES }],
    };
}

// Returns 'unavailable' | 'downloadable' | 'downloading' | 'available' per input modality.
export async function detectModalities() {
    const result = { text: await LanguageModel.availability(optionsFor(['text'])) };
    for (const type of ['image', 'audio']) {
        try {
            result[type] = await LanguageModel.availability(optionsFor(['text', type]));
        } catch {
            result[type] = 'unavailable';
        }
    }
    return result;
}

export function createSession({ modalities, initialPrompts, signal, onProgress } = {}) {
    return LanguageModel.create({
        ...optionsFor(modalities),
        initialPrompts,
        signal,
        monitor(monitor) {
            monitor.addEventListener('downloadprogress', (event) => onProgress?.(event.loaded));
        },
    });
}

// Chrome renamed inputUsage/inputQuota to contextUsage/contextWindow; read both for older builds.
export function contextOf(session) {
    return {
        used: session?.contextUsage ?? session?.inputUsage ?? 0,
        total: session?.contextWindow ?? session?.inputQuota ?? 0,
    };
}

export function onContextOverflow(session, handler) {
    session.addEventListener('contextoverflow', handler);
    session.addEventListener('quotaoverflow', handler);
}
