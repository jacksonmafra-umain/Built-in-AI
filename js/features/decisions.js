import { createSession } from '../lib/model.js';
import { log, timed } from '../lib/log.js';

// Decisions: a state plus typed questions with fixed options, answered in one prompt.
// Each question becomes an `enum` in the `responseConstraint`, so the model can only pick a listed option.
// https://developer.chrome.com/docs/ai/structured-output-for-prompt-api

const PRESETS = {
    ticket: {
        label: 'Support ticket routing',
        state: `Subject: Can't log in after password reset
From: maria.silva@example.com (plan: Business, 40 seats)

I reset my password this morning and now the app says "account locked" every time I try to sign in. Three people on my team have the same problem. We have a client demo in two hours.`,
        questions: `Which team should handle this? -> billing | authentication | integrations | general support
How urgent is it? -> low | normal | high | critical
Does it affect more than one user? -> yes | no
Which reply template fits best? -> password reset steps | account unlock escalation | outage notice`,
    },
    email: {
        label: 'Inbox email',
        state: `From: finance@acme-supplies.example
Subject: Invoice INV-2291 overdue

Hello, our records show invoice INV-2291 (EUR 4,380.00, due 12 September) is still unpaid. Please confirm the payment date or let us know if there is a problem with the invoice. A PDF copy is attached.`,
        questions: `What kind of email is this? -> newsletter | invoice or payment | meeting request | personal | spam
Does it need a reply? -> yes | no
Who should see it? -> finance | sales | engineering | nobody
What tone should a reply have? -> formal | friendly | none needed`,
    },
    screenshot: {
        label: 'Error screenshot (image)',
        state: 'A user attached this screenshot to a bug report titled "Checkout broken".',
        questions: `What kind of problem is shown? -> JavaScript error | network error | layout bug | no error visible
Where does it happen? -> checkout | login | search | settings | unknown
Can the user work around it? -> yes | no | unclear
How severe is it? -> low | medium | high | critical`,
        image: true,
    },
};

const SYSTEM = 'You are a decision engine. Read the state, then answer every question by choosing exactly one of its options.';

// "Question? -> option | option" per line. Blank lines are ignored.
function parseQuestions(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, index) => {
            const [question, options = ''] = line.split('->');
            const choices = options.split('|').map((option) => option.trim()).filter(Boolean);
            if (!question.trim() || choices.length < 2) {
                throw new Error(`Line ${index + 1} needs a question and at least two options: "Question? -> a | b"`);
            }
            return { key: `q${index + 1}`, question: question.trim(), options: [...new Set(choices)] };
        });
}

function buildSchema(questions) {
    return {
        type: 'object',
        properties: Object.fromEntries(questions.map(({ key, options }) => [key, { type: 'string', enum: options }])),
        required: questions.map(({ key }) => key),
        additionalProperties: false,
    };
}

function buildPrompt(state, questions, hasImage) {
    const list = questions
        .map(({ key, question, options }) => `${key}: ${question} Options: ${options.join(', ')}.`)
        .join('\n');
    return `State:\n${state || '(none)'}${hasImage ? '\n(The attached image is part of the state.)' : ''}\n\nQuestions:\n${list}`;
}

// A sample error screenshot drawn on a canvas, so the image preset works without shipping an image asset.
function sampleScreenshot() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 640, 44);
    ctx.fillStyle = '#18181b';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('shop.example.com/checkout', 20, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(70, 90, 500, 200);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 3;
    ctx.strokeRect(70, 90, 500, 200);
    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Something went wrong', 95, 135);
    ctx.fillStyle = '#18181b';
    ctx.font = '16px monospace';
    ctx.fillText("Uncaught TypeError: Cannot read", 95, 180);
    ctx.fillText("properties of undefined (reading 'total')", 95, 202);
    ctx.fillText('at renderSummary (checkout.js:42)', 95, 224);
    ctx.fillStyle = '#a1a1aa';
    ctx.fillRect(95, 245, 140, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Pay now', 132, 266);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function initDecisions(modalities) {
    const form = document.querySelector('#decisions-form');
    const presetSelect = document.querySelector('#decisions-preset');
    const stateInput = document.querySelector('#decisions-state');
    const questionsInput = document.querySelector('#decisions-questions');
    const imageInput = document.querySelector('#decisions-image');
    const imagePreview = document.querySelector('#decisions-image-preview');
    const imageClear = document.querySelector('#decisions-image-clear');
    const runButton = document.querySelector('#decisions-run');
    const cards = document.querySelector('#decisions-cards');
    const meta = document.querySelector('#decisions-meta');
    const schemaOutput = document.querySelector('#decisions-schema');
    const imageSupported = modalities.image && modalities.image !== 'unavailable';

    // Warm base sessions per modality set; each run uses a clone so runs do not see each other.
    const bases = {};
    let image = null;

    function setImage(blob) {
        image = blob;
        URL.revokeObjectURL(imagePreview.src);
        imagePreview.hidden = !blob;
        imageClear.hidden = !blob;
        if (blob) imagePreview.src = URL.createObjectURL(blob);
        else imageInput.value = '';
    }

    if (!imageSupported) {
        imageInput.disabled = true;
        imageInput.closest('.attachment').title = 'Image input is not available on this device.';
    }
    imageInput.addEventListener('change', () => setImage(imageInput.files[0] ?? null));
    imageClear.addEventListener('click', () => setImage(null));

    function showSchema() {
        try {
            schemaOutput.textContent = JSON.stringify(buildSchema(parseQuestions(questionsInput.value)), null, 2);
            schemaOutput.classList.remove('error');
        } catch (error) {
            schemaOutput.textContent = error.message;
            schemaOutput.classList.add('error');
        }
    }

    presetSelect.replaceChildren(
        ...Object.entries(PRESETS).map(([value, { label, image }]) =>
            new Option(image && !imageSupported ? `${label}, needs image input` : label, value),
        ),
    );

    async function applyPreset() {
        const preset = PRESETS[presetSelect.value];
        stateInput.value = preset.state;
        questionsInput.value = preset.questions;
        cards.replaceChildren();
        meta.textContent = '';
        showSchema();
        setImage(preset.image && imageSupported ? await sampleScreenshot() : null);
    }

    presetSelect.addEventListener('change', applyPreset);
    questionsInput.addEventListener('input', showSchema);
    applyPreset();

    function renderCard({ question, options }, answer) {
        const card = document.createElement('li');
        card.className = 'decision';
        const title = document.createElement('p');
        title.className = 'decision-question';
        title.textContent = question;
        const choices = document.createElement('ul');
        choices.className = 'decision-options';
        for (const option of options) {
            const item = document.createElement('li');
            item.textContent = option;
            if (option === answer) {
                item.className = 'chosen';
                item.setAttribute('aria-label', `${option} (chosen)`);
            }
            choices.append(item);
        }
        card.append(title, choices);
        return card;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        meta.classList.remove('error');

        let questions;
        try {
            questions = parseQuestions(questionsInput.value);
            if (!questions.length) throw new Error('Add at least one question.');
        } catch (error) {
            meta.classList.add('error');
            meta.textContent = error.message;
            return;
        }

        const withImage = Boolean(image);
        const kind = withImage ? 'text+image' : 'text';
        runButton.disabled = true;
        cards.replaceChildren();
        meta.textContent = 'Deciding…';
        let run = null;
        try {
            bases[kind] ??= await timed(`LanguageModel.create() [decisions, ${kind}]`, () =>
                createSession({
                    modalities: withImage ? ['text', 'image'] : ['text'],
                    initialPrompts: [{ role: 'system', content: SYSTEM }],
                }),
            );
            run = await timed('session.clone()', () => bases[kind].clone());
            const text = buildPrompt(stateInput.value.trim(), questions, withImage);
            const content = [{ type: 'text', value: text }, ...(withImage ? [{ type: 'image', value: image }] : [])];
            const start = performance.now();
            const reply = await timed(`session.prompt({ responseConstraint }) [${questions.length} enums]`, () =>
                run.prompt([{ role: 'user', content }], { responseConstraint: buildSchema(questions) }),
            );
            const answers = JSON.parse(reply);
            cards.replaceChildren(...questions.map((question) => renderCard(question, answers[question.key])));
            meta.textContent = `${questions.length} decisions in one prompt, ${Math.round(performance.now() - start)} ms.`;
        } catch (error) {
            meta.classList.add('error');
            meta.textContent = `${error.name}: ${error.message}`;
        } finally {
            if (run) {
                run.destroy();
                log('session.destroy()', 'decisions run clone');
            }
            runButton.disabled = false;
        }
    });
}
