import { log } from '../lib/log.js';

// Read replies aloud with the Web Speech API (`speechSynthesis`).
// Voices marked "local" are synthesized on-device; others may use a network service.
// https://developer.mozilla.org/docs/Web/API/SpeechSynthesis

export function initSpeechOutput(chat) {
    const messages = document.querySelector('#chat-messages');
    const voiceSelect = document.querySelector('#voice-select');
    const autoRead = document.querySelector('#voice-auto-read');
    const stopButton = document.querySelector('#voice-stop');

    if (!('speechSynthesis' in self)) {
        voiceSelect.disabled = autoRead.disabled = stopButton.disabled = true;
        voiceSelect.replaceChildren(new Option('speech synthesis not supported'));
        return;
    }

    let voices = [];

    function loadVoices() {
        const all = speechSynthesis.getVoices();
        const english = all.filter((voice) => voice.lang.startsWith('en'));
        voices = (english.length ? english : all).sort((a, b) => b.localService - a.localService);
        const selected = voiceSelect.value;
        voiceSelect.replaceChildren(
            ...voices.map((voice) => new Option(`${voice.name} (${voice.localService ? 'local' : 'network'})`, voice.name)),
        );
        if (voices.some((voice) => voice.name === selected)) voiceSelect.value = selected;
    }

    function speak(text) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        const voice = voices.find(({ name }) => name === voiceSelect.value);
        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
        }
        utterance.addEventListener('start', () => (stopButton.disabled = false));
        utterance.addEventListener('end', () => (stopButton.disabled = !speechSynthesis.speaking));
        speechSynthesis.speak(utterance);
        log('speechSynthesis.speak()', voice ? `${voice.name}, ${text.length} chars` : `${text.length} chars`);
    }

    // Adds a "read" button to every finished assistant reply.
    function decorate() {
        for (const item of messages.querySelectorAll('.message.assistant:not(.streaming):not(.error)')) {
            if (item.querySelector('.speak')) continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'speak';
            button.textContent = 'read';
            button.addEventListener('click', () => speak(item.querySelector('.message-text').textContent));
            item.append(button);
        }
    }

    new MutationObserver(decorate).observe(messages, {
        childList: true,
        subtree: true,
        attributeFilter: ['class'],
    });

    // Auto-read: speak a reply right after it finishes streaming, not when switching sessions.
    let awaitingReply = false;
    chat.onChange(({ history, busy }) => {
        if (busy) {
            awaitingReply = true;
            return;
        }
        const last = history.at(-1);
        if (!awaitingReply || last?.role !== 'assistant') return;
        awaitingReply = false;
        if (autoRead.checked && !last.content.endsWith('[stopped]')) speak(last.content);
    });

    stopButton.addEventListener('click', () => {
        speechSynthesis.cancel();
        stopButton.disabled = true;
    });

    stopButton.disabled = true;
    decorate();
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
}
