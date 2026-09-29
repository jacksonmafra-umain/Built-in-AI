import { log, timed } from '../lib/log.js';

// Dictation with the Web Speech API (`SpeechRecognition`).
// Chrome 139+ can recognize speech on-device (`processLocally`) once a language pack is installed.
// Without it, Chrome falls back to a cloud service, which the UI labels clearly.
// https://github.com/WebAudio/web-speech-api/blob/main/explainers/on-device-speech-recognition.md

const LANG = 'en-US';
const LOCAL_OPTIONS = { langs: [LANG], processLocally: true };

export async function initSpeechInput() {
    const input = document.querySelector('#chat-input');
    const dictateButton = document.querySelector('#dictate');
    const installButton = document.querySelector('#dictate-install');
    const status = document.querySelector('#dictate-status');
    const Recognition = self.SpeechRecognition ?? self.webkitSpeechRecognition;

    if (!Recognition) {
        dictateButton.disabled = true;
        status.textContent = 'speech recognition not supported';
        return;
    }

    let local = false;
    let recognition = null;

    function setMode(isLocal) {
        local = isLocal;
        resetLabel();
        status.textContent = local ? '' : 'cloud: audio leaves the device';
    }

    function resetLabel() {
        dictateButton.textContent = local ? 'dictate (on-device)' : 'dictate (cloud)';
        dictateButton.title = local
            ? 'Speech is recognized on this device.'
            : 'On-device recognition is not ready: audio is sent to a cloud speech service.';
    }

    setMode(false);

    if (typeof Recognition.available === 'function') {
        try {
            const availability = await timed('SpeechRecognition.available()', () => Recognition.available(LOCAL_OPTIONS));
            if (availability === 'available') setMode(true);
            else if (availability !== 'unavailable') installButton.hidden = false;
        } catch {
            // Keep the cloud fallback.
        }
    }

    installButton.addEventListener('click', async () => {
        installButton.disabled = true;
        status.textContent = 'installing language pack…';
        try {
            const installed = await timed('SpeechRecognition.install()', () => Recognition.install(LOCAL_OPTIONS));
            installButton.hidden = installed;
            setMode(installed);
            if (!installed) status.textContent = 'install failed, using cloud';
        } catch (error) {
            status.textContent = `install failed: ${error.message}`;
        } finally {
            installButton.disabled = false;
        }
    });

    dictateButton.addEventListener('click', () => {
        if (recognition) {
            recognition.stop();
            return;
        }

        recognition = new Recognition();
        recognition.lang = LANG;
        recognition.interimResults = true;
        recognition.continuous = true;
        if (local) recognition.processLocally = true;

        const prefix = input.value.trim() ? `${input.value.trimEnd()} ` : '';
        recognition.addEventListener('result', (event) => {
            let transcript = '';
            for (const result of event.results) transcript += result[0].transcript;
            input.value = prefix + transcript.trim();
        });
        recognition.addEventListener('error', (event) => {
            status.textContent = `error: ${event.error}`;
            log('SpeechRecognition error', event.error, { error: true });
        });
        recognition.addEventListener('end', () => {
            recognition = null;
            dictateButton.classList.remove('recording');
            resetLabel();
            input.focus();
        });

        recognition.start();
        log('SpeechRecognition.start()', local ? 'on-device' : 'cloud');
        dictateButton.classList.add('recording');
        dictateButton.textContent = 'stop dictation';
    });
}
