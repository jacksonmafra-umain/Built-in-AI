// Multimodal input: an image file and a microphone recording, sent as prompt content parts.
// https://developer.chrome.com/docs/ai/prompt-api#multimodal_capabilities

export function initAttachments(chat, modalities) {
    const imageInput = document.querySelector('#image-input');
    const imagePreview = document.querySelector('#image-preview');
    const recordButton = document.querySelector('#record-audio');
    const audioPreview = document.querySelector('#audio-preview');
    const supported = (type) => modalities[type] && modalities[type] !== 'unavailable';

    if (supported('image')) {
        chat.addContentProvider('image', {
            collect: () => (imageInput.files[0] ? [{ type: 'image', value: imageInput.files[0] }] : []),
            clear() {
                imageInput.value = '';
                imagePreview.hidden = true;
                URL.revokeObjectURL(imagePreview.src);
            },
        });

        imageInput.addEventListener('change', () => {
            const file = imageInput.files[0];
            URL.revokeObjectURL(imagePreview.src);
            imagePreview.hidden = !file;
            if (file) imagePreview.src = URL.createObjectURL(file);
        });
    } else {
        imageInput.disabled = true;
        imageInput.closest('.attachment').title = 'Image input is not available on this device.';
    }

    if (!supported('audio')) {
        recordButton.disabled = true;
        recordButton.title = 'Audio input is not available on this device (it needs a GPU).';
        return;
    }

    let recorder = null;
    let recording = null;

    chat.addContentProvider('audio', {
        collect: () => (recording ? [{ type: 'audio', value: recording }] : []),
        clear() {
            recording = null;
            audioPreview.hidden = true;
            URL.revokeObjectURL(audioPreview.src);
            recordButton.textContent = 'Record audio';
        },
    });

    recordButton.addEventListener('click', async () => {
        if (recorder?.state === 'recording') {
            recorder.stop();
            return;
        }

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            recordButton.title = `Microphone unavailable: ${error.message}`;
            return;
        }

        const chunks = [];
        recorder = new MediaRecorder(stream);
        recorder.addEventListener('dataavailable', (event) => event.data.size && chunks.push(event.data));
        recorder.addEventListener('stop', () => {
            stream.getTracks().forEach((track) => track.stop());
            recording = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            URL.revokeObjectURL(audioPreview.src);
            audioPreview.src = URL.createObjectURL(recording);
            audioPreview.hidden = false;
            recordButton.classList.remove('recording');
            recordButton.textContent = 'Record again';
        });
        recorder.start();
        recordButton.classList.add('recording');
        recordButton.textContent = 'Stop recording';
    });
}
