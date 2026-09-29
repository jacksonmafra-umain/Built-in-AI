// Minimal Markdown for model replies: headings, lists, fenced code, bold, italic, inline code.
// Builds DOM nodes with textContent only, so model output is never parsed as HTML.

const FENCE = /^```\s*(\S*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
// Underscore emphasis needs word boundaries so snake_case names stay intact.
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|(?<!\w)__[^_]+__(?!\w)|\*[^*\s][^*]*\*|(?<!\w)_[^_\s][^_]*_(?!\w))/;

export function parseBlocks(source) {
    const blocks = [];
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    let paragraph = [];

    const flush = () => {
        if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join('\n') });
        paragraph = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const fence = line.match(FENCE);
        if (fence) {
            flush();
            const code = [];
            // An unclosed fence (mid-stream) runs to the end of the text.
            while (++i < lines.length && !FENCE.test(lines[i])) code.push(lines[i]);
            blocks.push({ type: 'code', lang: fence[1], text: code.join('\n') });
            continue;
        }

        const heading = line.match(HEADING);
        if (heading) {
            flush();
            blocks.push({ type: 'h', level: heading[1].length, text: heading[2] });
            continue;
        }

        const bullet = line.match(BULLET);
        const numbered = !bullet && line.match(NUMBERED);
        if (bullet || numbered) {
            flush();
            const type = bullet ? 'ul' : 'ol';
            const last = blocks.at(-1);
            const item = (bullet ?? numbered)[1];
            if (last?.type === type && last.open) last.items.push(item);
            else blocks.push({ type, items: [item], open: true });
            continue;
        }

        if (!line.trim()) {
            flush();
            const last = blocks.at(-1);
            // A blank line inside a list keeps it open only if the next line continues it.
            if (last?.open && !(BULLET.test(lines[i + 1] ?? '') || NUMBERED.test(lines[i + 1] ?? ''))) last.open = false;
            continue;
        }

        const last = blocks.at(-1);
        if (last?.open) last.open = false;
        paragraph.push(line);
    }
    flush();
    return blocks.map(({ open, ...block }) => block);
}

export function parseInline(text) {
    const tokens = [];
    for (const part of text.split(INLINE)) {
        if (!part) continue;
        if (part.startsWith('`') && part.endsWith('`') && part.length > 1) tokens.push({ type: 'code', value: part.slice(1, -1) });
        else if (/^(\*\*|__).+\1$/.test(part)) tokens.push({ type: 'strong', value: part.slice(2, -2) });
        else if (/^([*_]).+\1$/.test(part)) tokens.push({ type: 'em', value: part.slice(1, -1) });
        else tokens.push({ type: 'text', value: part });
    }
    return tokens;
}

function inlineNodes(text) {
    return parseInline(text).map(({ type, value }) => {
        if (type === 'text') return document.createTextNode(value);
        const element = document.createElement(type);
        element.textContent = value;
        return element;
    });
}

export function renderMarkdown(source) {
    return parseBlocks(source).map((block) => {
        if (block.type === 'code') {
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = block.text;
            pre.append(code);
            return pre;
        }
        if (block.type === 'ul' || block.type === 'ol') {
            const list = document.createElement(block.type);
            list.append(
                ...block.items.map((item) => {
                    const li = document.createElement('li');
                    li.append(...inlineNodes(item));
                    return li;
                }),
            );
            return list;
        }
        const element = document.createElement(block.type === 'h' ? `h${Math.min(block.level + 2, 6)}` : 'p');
        element.append(...inlineNodes(block.text));
        return element;
    });
}
