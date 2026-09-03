import { describe, it, expect } from 'vitest';
import {
    measureText,
    measureLines,
    wrapText,
    fitBoxText,
    stateLabelWidth,
    STATE_LABEL_GAP,
} from '../textMetrics';

describe('measureText', () => {
    it('returns zero for empty text', () => {
        expect(measureText('', 12)).toBe(0);
    });

    it('scales linearly with font size', () => {
        const at10 = measureText('Fermentieren', 10);
        const at20 = measureText('Fermentieren', 20);
        expect(at20).toBeCloseTo(at10 * 2, 6);
    });

    it('gives narrow glyphs less width than wide ones', () => {
        // The whole point of a metric table over a flat per-character factor.
        expect(measureText('lll', 12)).toBeLessThan(measureText('mmm', 12));
        expect(measureText('iii', 12)).toBeLessThan(measureText('WWW', 12));
    });

    it('handles German umlauts as normal letters rather than fallbacks', () => {
        expect(measureText('ä', 12)).toBeCloseTo(measureText('a', 12), 6);
        expect(measureText('Ü', 12)).toBeCloseTo(measureText('U', 12), 6);
    });

    it('matches a browser measurement within a few percent, erring high', () => {
        // 'Säure / Lauge (dosiert, Neutralisierung)' at 11px measures 186px via
        // getBBox in Chromium. Over-estimating is the safe direction: the layout
        // reserves the space this returns.
        const width = measureText('Säure / Lauge (dosiert, Neutralisierung)', 11);
        expect(width).toBeGreaterThanOrEqual(186);
        expect(width).toBeLessThan(186 * 1.1);
    });
});

describe('measureLines', () => {
    it('returns the widest line', () => {
        const lines = ['kurz', 'deutlich laenger', 'mittel'];
        expect(measureLines(lines, 12)).toBeCloseTo(measureText('deutlich laenger', 12), 6);
    });

    it('returns zero for no lines', () => {
        expect(measureLines([], 12)).toBe(0);
    });
});

describe('stateLabelWidth', () => {
    it('uses the wider of id and name', () => {
        const width = stateLabelWidth('S1', 'Ein deutlich laengerer Name');
        expect(width).toBeCloseTo(measureText('Ein deutlich laengerer Name', 11), 6);
    });

    it('measures only the id when the name repeats it', () => {
        expect(stateLabelWidth('Restmedium', 'Restmedium')).toBeCloseTo(
            measureText('Restmedium', 11),
            6,
        );
    });

    it('falls back to the id when there is no name', () => {
        expect(stateLabelWidth('Abluft')).toBeCloseTo(measureText('Abluft', 11), 6);
    });

    it('keeps the label gap positive so labels clear the shape', () => {
        expect(STATE_LABEL_GAP).toBeGreaterThan(0);
    });
});

describe('wrapText', () => {
    it('leaves text that already fits on one line', () => {
        expect(wrapText('Dosieren', 500, 13)).toEqual(['Dosieren']);
    });

    it('breaks on spaces so every line fits', () => {
        const lines = wrapText('Schaumbildung Regulieren', 100, 13);
        expect(lines.length).toBeGreaterThan(1);
        for (const line of lines) {
            expect(measureText(line, 13)).toBeLessThanOrEqual(100);
        }
    });

    it('never splits a single word', () => {
        expect(wrapText('Wirbelschichtgranulierung', 20, 13)).toEqual([
            'Wirbelschichtgranulierung',
        ]);
    });

    it('respects the line limit, putting the remainder on the last line', () => {
        const lines = wrapText('eins zwei drei vier fuenf sechs sieben', 40, 13, 2);
        expect(lines).toHaveLength(2);
        expect(lines.join(' ')).toBe('eins zwei drei vier fuenf sechs sieben');
    });

    it('keeps every word, in order', () => {
        const text = 'Saeure Lauge dosiert Neutralisation';
        expect(wrapText(text, 60, 11).join(' ')).toBe(text);
    });
});

describe('fitBoxText', () => {
    it('keeps the default size when the text fits', () => {
        const fitted = fitBoxText(['Dosieren'], 200, 60, 13);
        expect(fitted.fontSize).toBe(13);
        expect(fitted.lines).toEqual(['Dosieren']);
    });

    it('wraps at full size rather than shrinking the font', () => {
        // The old behaviour shrank 'Lagern (Kühlen & Rühren)' to 7px in a 150px
        // box that had room for three full-size lines.
        const fitted = fitBoxText(['LagernMedien', 'Lagern (Kühlen & Rühren)'], 138, 72, 13);
        expect(fitted.fontSize).toBe(13);
        expect(fitted.lines.length).toBeGreaterThan(2);
    });

    it('never returns lines wider than the box', () => {
        const fitted = fitBoxText(['SchaumRegeln', 'Schaumbildung Regulieren'], 138, 72, 13);
        for (const line of fitted.lines) {
            expect(measureText(line, fitted.fontSize)).toBeLessThanOrEqual(138);
        }
    });

    it('never returns a block taller than the box', () => {
        const fitted = fitBoxText(
            ['A', 'Ein sehr langer Name mit vielen Woertern darin'],
            80,
            40,
            13,
        );
        expect(fitted.lines.length * fitted.lineHeight).toBeLessThanOrEqual(40);
    });

    it('shrinks only when wrapping cannot help', () => {
        const fitted = fitBoxText(['Wirbelschichtgranulierung'], 60, 60, 13);
        expect(fitted.fontSize).toBeLessThan(13);
    });

    it('respects the minimum size', () => {
        const fitted = fitBoxText(['x'.repeat(400)], 40, 40, 13, 7);
        expect(fitted.fontSize).toBe(7);
    });

    it('ignores empty parts', () => {
        const fitted = fitBoxText(['Dosieren', ''], 200, 60, 13);
        expect(fitted.lines).toEqual(['Dosieren']);
    });
});
