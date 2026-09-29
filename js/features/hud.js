// Live counters in the header, fed by the API log and the token stream.

const COUNTERS = [
    ['create', /^LanguageModel\.create/],
    ['prompt', /^session\.prompt/],
    ['clone', /^session\.clone/],
    ['destroy', /^session\.destroy/],
    ['abort', /^AbortController/],
    ['overflow', /^contextoverflow/],
    ['error', null],
];

export function initHud(backdrop) {
    const hud = document.querySelector('#hud');
    const counts = Object.fromEntries(COUNTERS.map(([name]) => [name, 0]));
    const values = {};
    let chunks = [];

    function row(name) {
        const item = document.createElement('div');
        const label = document.createElement('dt');
        label.textContent = name;
        const value = document.createElement('dd');
        item.append(label, value);
        values[name] = value;
        return item;
    }

    hud.replaceChildren(...[...COUNTERS.map(([name]) => name), 'chunks/s', 'energy'].map(row));

    addEventListener('ai:call', ({ detail: { call, error } }) => {
        if (error) counts.error++;
        for (const [name, pattern] of COUNTERS) if (pattern?.test(call)) counts[name]++;
    });
    addEventListener('ai:token', () => chunks.push(performance.now()));

    function update() {
        const now = performance.now();
        chunks = chunks.filter((time) => now - time < 1000);
        for (const [name] of COUNTERS) values[name].textContent = counts[name];
        values['chunks/s'].textContent = chunks.length;
        values.energy.textContent = backdrop.energy.toFixed(2);
    }

    update();
    setInterval(update, 250);
}
