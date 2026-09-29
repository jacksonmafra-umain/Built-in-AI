// Builds the tab bar from the panels declared in the markup.

export function initTabs() {
    const nav = document.querySelector('.tabs');
    const panels = [...document.querySelectorAll('#panels > [role="tabpanel"]')];

    const buttons = panels.map((panel, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'tab';
        button.id = `tab-${panel.id}`;
        button.textContent = panel.dataset.title;
        button.setAttribute('aria-controls', panel.id);
        panel.setAttribute('aria-labelledby', button.id);
        button.addEventListener('click', () => select(index));
        return button;
    });

    function select(index) {
        buttons.forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
        panels.forEach((panel, i) => (panel.hidden = i !== index));
    }

    nav.replaceChildren(...buttons);
    if (panels.length) select(0);
}
