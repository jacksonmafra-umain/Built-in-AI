import { createSession, detectModalities, isSupported } from '../lib/model.js';
import { log, timed } from '../lib/log.js';

// A broken on-device install can report 'available' and then echo the formatted prompt back,
// e.g. "CPU backend Fastest inference TopK: 64 ... End.Model:". One tiny prompt catches that.
const ECHO = /End\.Model:|^\s*[CG]PU backend/;

async function checkHealth() {
    let session;
    try {
        session = await timed('LanguageModel.create() [health check]', () => createSession());
        const reply = await timed('session.prompt() [health check]', () =>
            session.prompt('Reply with the single word: pong'),
        );
        return ECHO.test(reply) ? 'echo' : 'ok';
    } catch (error) {
        return `failed: ${error.message}`;
    } finally {
        if (session) {
            session.destroy();
            log('session.destroy()', 'health check session');
        }
    }
}

// Checks whether the built-in model can run here and, if needed, downloads it.
// Calls onReady(modalities) once the model is usable.
export async function initStatus({ onReady }) {
    const card = document.querySelector('#status');
    const message = card.querySelector('.status-message');
    const badges = card.querySelector('.badges');
    const downloadButton = card.querySelector('#download-model');
    const progress = card.querySelector('progress');

    function show(text, state) {
        message.textContent = text;
        card.dataset.state = state;
    }

    async function ready(modalities) {
        show('Checking that the model answers…', 'pending');
        const health = await checkHealth();
        if (health === 'ok') show('The built-in model is ready.', 'ready');
        else if (health === 'echo')
            show(
                'Chrome reports the model as available, but it only echoes the prompt back. Update "Optimization Guide On Device Model" in chrome://components, or quit Chrome, delete the OptGuideOnDeviceModel folder in the Chrome profile directory and let it download again.',
                'error',
            );
        else show(`The model is available but a test prompt ${health}`, 'error');
        onReady(modalities);
    }

    if (!isSupported()) {
        show('The Prompt API is not available in this browser. See the requirements below.', 'error');
        card.querySelector('.requirements').hidden = false;
        return;
    }

    let modalities;
    try {
        modalities = await timed('LanguageModel.availability()', detectModalities);
    } catch (error) {
        show(`Could not check availability: ${error.message}`, 'error');
        return;
    }

    badges.replaceChildren(
        ...Object.entries(modalities).map(([type, availability]) => {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.dataset.availability = availability;
            badge.textContent = `${type}: ${availability}`;
            return badge;
        }),
    );

    switch (modalities.text) {
        case 'available':
            await ready(modalities);
            return;
        case 'unavailable':
            show('This device cannot run Gemini Nano. Check the hardware requirements below.', 'error');
            card.querySelector('.requirements').hidden = false;
            return;
    }

    // Downloading requires a user gesture, so `create()` has to run from a click.
    show('The model needs a one-time download before first use.', 'pending');
    downloadButton.hidden = false;
    downloadButton.addEventListener('click', async () => {
        downloadButton.disabled = true;
        progress.hidden = false;
        try {
            const session = await timed('LanguageModel.create() [download]', () =>
                createSession({
                    onProgress(loaded) {
                        progress.value = loaded;
                        show(`Downloading model… ${Math.round(loaded * 100)}%`, 'pending');
                    },
                }),
            );
            session.destroy();
            log('session.destroy()', 'download warm-up session');
            downloadButton.hidden = true;
            progress.hidden = true;
            await ready(await detectModalities());
        } catch (error) {
            downloadButton.disabled = false;
            show(`Download failed: ${error.message}`, 'error');
        }
    });
}
