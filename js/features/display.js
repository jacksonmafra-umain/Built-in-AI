// Display toggles for the backdrop and CRT overlay, remembered per browser.

const STORAGE_KEY = 'built-in-ai-demo:display';
const DEFAULTS = { rain: true, glitch: true, crt: true, motion: 1, palette: 'phosphor' };

export function initDisplay(backdrop) {
    const form = document.querySelector('#display-form');
    const motionValue = document.querySelector('#display-motion-value');
    let settings = { ...DEFAULTS };
    try {
        settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY)) };
    } catch {
        // Ignore blocked or corrupt storage and use the defaults.
    }

    function apply() {
        const root = document.documentElement;
        root.dataset.palette = settings.palette;
        root.classList.toggle('no-crt', !settings.crt);
        motionValue.textContent = `${Number(settings.motion).toFixed(2)}×`;
        backdrop.refreshPalette();
        backdrop.setOptions({ rain: settings.rain, glitch: settings.glitch, motion: Number(settings.motion) });
    }

    for (const [key, value] of Object.entries(settings)) {
        const field = form.elements[key];
        if (!field) continue;
        if (field.type === 'checkbox') field.checked = value;
        else field.value = value;
    }

    form.addEventListener('input', (event) => {
        const field = event.target;
        settings[field.name] = field.type === 'checkbox' ? field.checked : field.value;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch {
            // Settings still apply for this page view.
        }
        apply();
    });

    apply();
}
