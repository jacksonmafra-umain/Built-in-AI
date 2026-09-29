// Animated ASCII backdrop drawn on a canvas: a rotating wireframe, a shaded core that
// swells while the model streams tokens, falling rain and the occasional glitch.
// Pure text rendering, no image assets.

const RAMP = ' .:-=+*#%@';
const RAIN_CHARS = '01+=:;*#<>/\\|';
const FONT_SIZE = 13;
const LINE_HEIGHT = 15;
const FRAME_MS = 1000 / 30;

// Octahedron: six vertices on the axes, twelve edges.
const VERTICES = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const EDGES = [
    [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [4, 3], [3, 5], [5, 2],
];

// Color buckets, painted in this order.
const DIM = 1;
const TEXT = 2;
const ACCENT = 3;

export function initBackdrop(canvas) {
    const context = canvas.getContext('2d');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const options = { rain: true, glitch: true, motion: 1 };

    let cols = 0;
    let rows = 0;
    let cellWidth = 8;
    let chars = [];
    let colors = new Uint8Array(0);
    let drops = [];
    let palette = {};
    let energy = 0;
    let time = 0;
    let lastFrame = 0;

    function readPalette() {
        const style = getComputedStyle(document.documentElement);
        palette = {
            [DIM]: style.getPropertyValue('--text-muted').trim(),
            [TEXT]: style.getPropertyValue('--text').trim(),
            [ACCENT]: style.getPropertyValue('--accent').trim(),
            bg: style.getPropertyValue('--bg').trim(),
        };
    }

    function resize() {
        const ratio = Math.min(devicePixelRatio || 1, 2);
        canvas.width = innerWidth * ratio;
        canvas.height = innerHeight * ratio;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.font = `${FONT_SIZE}px ui-monospace, Menlo, Consolas, monospace`;
        context.textBaseline = 'top';
        cellWidth = context.measureText('M').width;
        cols = Math.ceil(innerWidth / cellWidth);
        rows = Math.ceil(innerHeight / LINE_HEIGHT);
        chars = new Array(cols * rows);
        colors = new Uint8Array(cols * rows);
        drops = Array.from({ length: Math.round(cols / 6) }, () => newDrop(true));
        draw();
    }

    function newDrop(anywhere = false) {
        return {
            x: Math.floor(Math.random() * cols),
            y: anywhere ? Math.random() * rows : -Math.random() * 20,
            speed: 0.15 + Math.random() * 0.5,
            length: 4 + Math.floor(Math.random() * 10),
        };
    }

    function put(x, y, char, color) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) return;
        const index = y * cols + x;
        if (colors[index] > color) return;
        chars[index] = char;
        colors[index] = color;
    }

    function drawCore(centerX, centerY, radius) {
        const aspect = LINE_HEIGHT / cellWidth;
        const light = [Math.cos(time * 0.7), -0.6, 0.8];
        const length = Math.hypot(...light);
        for (let y = Math.floor(centerY - radius); y <= centerY + radius; y++) {
            for (let x = Math.floor(centerX - radius * aspect); x <= centerX + radius * aspect; x++) {
                const nx = (x - centerX) / (radius * aspect);
                const ny = (y - centerY) / radius;
                const d = nx * nx + ny * ny;
                if (d > 1) continue;
                const nz = Math.sqrt(1 - d);
                const shade = Math.max(0, (nx * light[0] + ny * light[1] + nz * light[2]) / length);
                const char = RAMP[Math.min(RAMP.length - 1, Math.floor(shade * (RAMP.length - 1) + energy * 2))];
                if (char !== ' ') put(x, y, char, shade > 0.75 ? ACCENT : TEXT);
            }
        }
    }

    function drawWireframe(centerX, centerY, size) {
        const aspect = LINE_HEIGHT / cellWidth;
        const a = time * 0.35;
        const b = time * 0.22;
        const projected = VERTICES.map(([x, y, z]) => {
            const x1 = x * Math.cos(a) - z * Math.sin(a);
            const z1 = x * Math.sin(a) + z * Math.cos(a);
            const y1 = y * Math.cos(b) - z1 * Math.sin(b);
            const z2 = y * Math.sin(b) + z1 * Math.cos(b);
            const scale = size / (2.6 - z2);
            return [centerX + x1 * scale * aspect * 1.4, centerY + y1 * scale, z2];
        });
        for (const [from, to] of EDGES) {
            const [x0, y0, z0] = projected[from];
            const [x1, y1, z1] = projected[to];
            const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const depth = z0 + (z1 - z0) * t;
                put(
                    Math.round(x0 + (x1 - x0) * t),
                    Math.round(y0 + (y1 - y0) * t),
                    depth > 0.3 ? '+' : depth > -0.3 ? ':' : '.',
                    depth > 0 ? TEXT : DIM,
                );
            }
        }
    }

    function drawRain(step) {
        drops.forEach((drop, index) => {
            drop.y += drop.speed * step * (1 + energy * 2);
            const head = Math.floor(drop.y);
            for (let i = 0; i < drop.length; i++) {
                const char = RAIN_CHARS[(head * 7 + i * 13 + drop.x) % RAIN_CHARS.length];
                put(drop.x, head - i, char, i === 0 ? TEXT : DIM);
            }
            if (head - drop.length > rows) drops[index] = newDrop();
        });
    }

    function glitch() {
        if (Math.random() > 0.04 + energy * 0.2) return;
        const band = Math.floor(Math.random() * rows);
        const height = 1 + Math.floor(Math.random() * 3);
        const shift = Math.floor((Math.random() - 0.5) * 12);
        for (let y = band; y < Math.min(rows, band + height); y++) {
            const start = y * cols;
            const line = chars.slice(start, start + cols);
            const lineColors = colors.slice(start, start + cols);
            for (let x = 0; x < cols; x++) {
                const from = (x - shift + cols) % cols;
                chars[start + x] = Math.random() < 0.05 ? '#' : line[from];
                colors[start + x] = lineColors[from];
            }
        }
    }

    function draw(step = 1) {
        chars.fill(' ');
        colors.fill(0);

        const centerX = cols / 2;
        const centerY = rows / 2;
        const size = Math.min(rows * 0.9, (cols * cellWidth) / LINE_HEIGHT);
        drawWireframe(centerX, centerY, size);
        drawCore(centerX, centerY, rows * (0.16 + energy * 0.06));
        if (options.rain) drawRain(step);
        if (options.glitch) glitch();

        context.fillStyle = palette.bg;
        context.fillRect(0, 0, innerWidth, innerHeight);
        for (const color of [DIM, TEXT, ACCENT]) {
            context.fillStyle = palette[color];
            for (let y = 0; y < rows; y++) {
                let line = '';
                for (let x = 0; x < cols; x++) {
                    const index = y * cols + x;
                    line += colors[index] === color ? chars[index] : ' ';
                }
                if (line.trim()) context.fillText(line, 0, y * LINE_HEIGHT);
            }
        }
    }

    function frame(now) {
        requestAnimationFrame(frame);
        if (document.hidden || reducedMotion.matches || now - lastFrame < FRAME_MS) return;
        const step = Math.min(3, (now - lastFrame) / FRAME_MS);
        lastFrame = now;
        time += (step / 30) * options.motion * (1 + energy * 1.5);
        energy *= 0.965;
        draw(step);
    }

    readPalette();
    resize();
    addEventListener('resize', resize);
    addEventListener('ai:token', () => (energy = Math.min(1, energy + 0.06)));
    requestAnimationFrame(frame);

    return {
        get energy() {
            return energy;
        },
        setOptions(next) {
            Object.assign(options, next);
            draw();
        },
        refreshPalette() {
            readPalette();
            draw();
        },
    };
}
