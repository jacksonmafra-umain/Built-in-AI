import { createSession } from '../lib/model.js';
import { log, timed } from '../lib/log.js';

// Structured output: constrain the reply to a JSON Schema with `responseConstraint`.
// https://developer.chrome.com/docs/ai/structured-output-for-prompt-api

const PRESETS = {
    triage: {
        label: 'Bug report triage',
        instruction: 'Triage this bug report.',
        input: 'Since the last release the checkout button does nothing on Safari iOS 18. Tapping it shows no spinner and no error. Android and desktop are fine. This blocks every iPhone customer from paying.',
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                platform: { type: 'string' },
                component: { type: 'string' },
                nextSteps: { type: 'array', items: { type: 'string' }, maxItems: 3 },
            },
            required: ['title', 'severity', 'platform', 'component', 'nextSteps'],
            additionalProperties: false,
        },
    },
    sentiment: {
        label: 'Review sentiment',
        instruction: 'Classify the sentiment of this app store review.',
        input: 'Love the new dark mode and the app finally feels fast, but it logged me out twice this week.',
        schema: {
            type: 'object',
            properties: {
                sentiment: { type: 'string', enum: ['positive', 'mixed', 'negative'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                praise: { type: 'array', items: { type: 'string' } },
                complaints: { type: 'array', items: { type: 'string' } },
            },
            required: ['sentiment', 'confidence', 'praise', 'complaints'],
            additionalProperties: false,
        },
    },
    hashtags: {
        label: 'Hashtags (regex pattern)',
        instruction: 'Suggest hashtags for this post.',
        input: 'We just shipped offline mode for our field-service app. Technicians can now close work orders without signal and everything syncs when they are back online.',
        schema: {
            type: 'array',
            items: { type: 'string', pattern: '^#[^\\s#]+$' },
            minItems: 3,
            maxItems: 5,
        },
    },
    boolean: {
        label: 'Yes / no',
        instruction: 'Does this message ask for a refund?',
        input: 'Hi, I was charged twice for my subscription this month. Can you send the extra payment back to my card?',
        schema: { type: 'boolean' },
    },
};

export function initStructured() {
    const form = document.querySelector('#structured-form');
    const presetSelect = document.querySelector('#structured-preset');
    const instructionInput = document.querySelector('#structured-instruction');
    const textInput = document.querySelector('#structured-input');
    const schemaInput = document.querySelector('#structured-schema');
    const runButton = document.querySelector('#structured-run');
    const output = document.querySelector('#structured-output');
    const raw = document.querySelector('#structured-raw');

    // One base session is kept warm; each run uses a clone so runs do not see each other.
    let base = null;

    presetSelect.replaceChildren(
        ...Object.entries(PRESETS).map(([value, { label }]) => new Option(label, value)),
    );

    function applyPreset() {
        const preset = PRESETS[presetSelect.value];
        instructionInput.value = preset.instruction;
        textInput.value = preset.input;
        schemaInput.value = JSON.stringify(preset.schema, null, 2);
        output.textContent = '';
        raw.textContent = '';
    }

    presetSelect.addEventListener('change', applyPreset);
    applyPreset();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        output.className = 'structured-output';

        let schema;
        try {
            schema = JSON.parse(schemaInput.value);
        } catch (error) {
            output.classList.add('error');
            output.textContent = `Invalid JSON Schema: ${error.message}`;
            return;
        }

        runButton.disabled = true;
        output.textContent = 'Generating…';
        raw.textContent = '';
        let run = null;
        try {
            base ??= await timed('LanguageModel.create() [structured]', () =>
                createSession({
                    initialPrompts: [{ role: 'system', content: 'You extract structured data. Be precise and brief.' }],
                }),
            );
            run = await timed('session.clone()', () => base.clone());
            const prompt = `${instructionInput.value.trim()}\n\n${textInput.value.trim()}`;
            const reply = await timed('session.prompt({ responseConstraint })', () =>
                run.prompt(prompt, { responseConstraint: schema }),
            );
            raw.textContent = reply;
            output.textContent = JSON.stringify(JSON.parse(reply), null, 2);
            output.classList.add('ok');
        } catch (error) {
            output.classList.add('error');
            output.textContent = `${error.name}: ${error.message}`;
        } finally {
            if (run) {
                run.destroy();
                log('session.destroy()', 'structured run clone');
            }
            runButton.disabled = false;
        }
    });
}
