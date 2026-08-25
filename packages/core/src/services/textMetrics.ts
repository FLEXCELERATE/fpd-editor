/**
 * Text width estimation for the layout engine.
 *
 * The layout has to reserve horizontal space for labels *before* anything is
 * rendered, and it must do so without a DOM. These are the Adobe AFM advance
 * widths for Helvetica, in 1/1000 em — the metrics the renderer's font stack
 * (`Helvetica, Arial, sans-serif`) resolves to on every common platform.
 *
 * Measured against a real browser `getBBox()` the estimate runs about 4% high,
 * which is the desired direction: reserving slightly too much space keeps
 * labels apart, reserving too little makes them collide.
 */

import { STATE_LABEL_FONT_SIZE } from './designTokens';

/** Advance widths in 1/1000 em for Helvetica. */
const HELVETICA_WIDTHS: Record<string, number> = {
    ' ': 278,
    '!': 278,
    '"': 355,
    '#': 556,
    $: 556,
    '%': 889,
    '&': 667,
    "'": 191,
    '(': 333,
    ')': 333,
    '*': 389,
    '+': 584,
    ',': 278,
    '-': 333,
    '.': 278,
    '/': 278,
    '0': 556,
    '1': 556,
    '2': 556,
    '3': 556,
    '4': 556,
    '5': 556,
    '6': 556,
    '7': 556,
    '8': 556,
    '9': 556,
    ':': 278,
    ';': 278,
    '<': 584,
    '=': 584,
    '>': 584,
    '?': 556,
    '@': 1015,
    A: 667,
    B: 667,
    C: 722,
    D: 722,
    E: 667,
    F: 611,
    G: 778,
    H: 722,
    I: 278,
    J: 500,
    K: 667,
    L: 556,
    M: 833,
    N: 722,
    O: 778,
    P: 667,
    Q: 778,
    R: 722,
    S: 667,
    T: 611,
    U: 722,
    V: 667,
    W: 944,
    X: 667,
    Y: 667,
    Z: 611,
    '[': 278,
    '\\': 278,
    ']': 278,
    '^': 469,
    _: 556,
    '`': 333,
    a: 556,
    b: 556,
    c: 500,
    d: 556,
    e: 556,
    f: 278,
    g: 556,
    h: 556,
    i: 222,
    j: 222,
    k: 500,
    l: 222,
    m: 833,
    n: 556,
    o: 556,
    p: 556,
    q: 556,
    r: 333,
    s: 500,
    t: 278,
    u: 556,
    v: 500,
    w: 722,
    x: 500,
    y: 500,
    z: 500,
    '{': 334,
    '|': 260,
    '}': 334,
    '~': 584,
    // Latin-1 letters that actually occur in German process descriptions
    ä: 556,
    ö: 556,
    ü: 556,
    Ä: 667,
    Ö: 778,
    Ü: 722,
    ß: 611,
    é: 556,
    è: 556,
    á: 556,
    à: 556,
    '°': 400,
    '·': 278,
    '–': 556,
    '—': 1000,
    '„': 333,
    '“': 333,
    '”': 333,
    '’': 191,
};

/** Fallback for anything not in the table — the width of a lowercase 'n'. */
const DEFAULT_WIDTH = 556;

/**
 * Vertical space a state's label block occupies above its shape: the two label
 * lines plus the offset the renderer uses for the first one.
 */
export const STATE_LABEL_BLOCK_H = 35;

/**
 * Gap between a state's left edge and the right end of its label.
 *
 * The label is right-aligned and sits above and to the *left* of the shape,
 * clear of the shape's whole horizontal span. That matters for routing: ports
 * are spread across a side, so a state with two connections on its top edge has
 * a port left of its centre. Anything of the label reaching into the shape's x
 * range would sit under such a port — which not only drew the edge across its
 * own label but could make the port unreachable for the router entirely.
 */
export const STATE_LABEL_GAP = 6;

/**
 * Horizontal extent of a state's label block. The renderer puts the id on one
 * line and the name below it, both right-aligned to the same edge, so the block
 * is as wide as its wider line.
 */
export function stateLabelWidth(id: string, label?: string): number {
    const name = label || id;
    const lines = name !== id ? [id, name] : [id];
    return measureLines(lines, STATE_LABEL_FONT_SIZE);
}

/** Width of `text` in px when set at `fontSize` in the renderer's font stack. */
export function measureText(text: string, fontSize: number): number {
    let mille = 0;
    for (const ch of text) {
        mille += HELVETICA_WIDTHS[ch] ?? DEFAULT_WIDTH;
    }
    return (mille * fontSize) / 1000;
}

/** Width of the widest of several lines set at the same size. */
export function measureLines(lines: string[], fontSize: number): number {
    let widest = 0;
    for (const line of lines) {
        widest = Math.max(widest, measureText(line, fontSize));
    }
    return widest;
}

/**
 * Fit several pieces of text (typically an id and a name) into a box.
 *
 * Wrapping is tried first and the font size is only reduced when wrapping alone
 * cannot make the text fit. The previous behaviour shrank the font immediately,
 * which rendered a two-word operator name at 7px inside a box with two thirds of
 * its height unused.
 */
export function fitBoxText(
    parts: string[],
    maxWidth: number,
    maxHeight: number,
    defaultSize: number,
    minSize: number = 7,
): { lines: string[]; fontSize: number; lineHeight: number } {
    const wrapAll = (size: number): string[] => {
        const lines: string[] = [];
        for (const part of parts) {
            if (!part) continue;
            lines.push(...wrapText(part, maxWidth, size, 3));
        }
        return lines;
    };

    for (let size = defaultSize; size >= minSize; size -= 0.5) {
        const lines = wrapAll(size);
        const lineHeight = size * 1.2;
        if (measureLines(lines, size) <= maxWidth && lines.length * lineHeight <= maxHeight) {
            return { lines, fontSize: size, lineHeight };
        }
    }

    const lines = wrapAll(minSize);
    return { lines, fontSize: minSize, lineHeight: minSize * 1.2 };
}

/**
 * Break `text` into at most `maxLines` lines that each fit `maxWidth`, breaking
 * on spaces. Returns the original single line when it already fits. A word too
 * long to fit on its own is left over-long rather than split mid-word — the
 * caller decides whether to shrink the font for that case.
 */
export function wrapText(
    text: string,
    maxWidth: number,
    fontSize: number,
    maxLines: number = 3,
): string[] {
    if (measureText(text, fontSize) <= maxWidth) {
        return [text];
    }

    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= 1) {
        return [text];
    }

    const lines: string[] = [];
    let current = '';
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const candidate = current ? current + ' ' + word : word;
        if (current && measureText(candidate, fontSize) > maxWidth) {
            lines.push(current);
            if (lines.length === maxLines - 1) {
                // Last allowed line takes whatever is left, however wide.
                current = words.slice(i).join(' ');
                break;
            }
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) {
        lines.push(current);
    }
    return lines.length > 0 ? lines : [text];
}
