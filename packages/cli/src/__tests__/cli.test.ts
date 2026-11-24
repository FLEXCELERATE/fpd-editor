import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run, USAGE } from '../cli';

const VALID = `@startfpd
title "Reactor Module"
product P1 "Catalyst Solution"
product P2 "Reactor Product"
energy E1 "Thermal Energy"
process_operator PO1 "Reacting"
technical_resource TR1 "Stirred Tank Reactor"
P1 --> PO1
E1 --> PO1
PO1 --> P2
PO1 <..> TR1
@endfpd
`;

let dir: string;
let out: string[];
let err: string[];
const io = {
    out: (l: string) => out.push(l),
    err: (l: string) => err.push(l),
};

async function fixture(name: string, content: string): Promise<string> {
    const file = path.join(dir, name);
    await writeFile(file, content, 'utf8');
    return file;
}

beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'fpd-cli-'));
    out = [];
    err = [];
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('fpd check', () => {
    it('prints a one-line summary for a valid file', async () => {
        const file = await fixture('reactor.fpd', VALID);
        expect(await run(['check', file], io)).toBe(0);
        expect(out).toEqual([
            'OK "Reactor Module": 3 states, 1 operators, 1 resources, 3 flows, 1 usages',
        ]);
        expect(err).toEqual([]);
    });

    it('reports syntax errors with line numbers and exits 1', async () => {
        const file = await fixture('broken.fpd', VALID.replace('product P2', 'prodcut P2'));
        expect(await run(['check', file], io)).toBe(1);
        expect(err.some((l) => l.startsWith('ERROR') && l.includes('Line'))).toBe(true);
        expect(err.at(-1)).toMatch(/^FAIL \d+ error\(s\)$/);
        expect(out).toEqual([]);
    });

    it('reports VDI 3682 rule violations as warnings without failing', async () => {
        const file = await fixture('rule.fpd', VALID.replace('@endfpd', 'P1 --> P2\n@endfpd'));
        expect(await run(['check', file], io)).toBe(0);
        expect(err.some((l) => l.startsWith('WARN'))).toBe(true);
        expect(out[0]).toMatch(/^OK /);
    });

    it('exits 2 for a missing file', async () => {
        expect(await run(['check', path.join(dir, 'nope.fpd')], io)).toBe(2);
        expect(err[0]).toMatch(/^fpd: ENOENT/);
    });
});

describe('fpd render', () => {
    it('writes an SVG next to the input by default', async () => {
        const file = await fixture('reactor.fpd', VALID);
        expect(await run(['render', file], io)).toBe(0);
        const svg = await readFile(path.join(dir, 'reactor.svg'), 'utf8');
        expect(svg).toContain('<svg');
        expect(out[0]).toContain(`-> ${path.join(dir, 'reactor.svg')}`);
    });

    it('writes several formats into --out-dir', async () => {
        const file = await fixture('reactor.fpd', VALID);
        const outDir = path.join(dir, 'build', 'fpd');
        const code = await run(
            ['render', file, '--format', 'svg,pdf,xml', '--out-dir', outDir, '--page-size', 'a4'],
            io,
        );
        expect(code).toBe(0);
        const pdf = await readFile(path.join(outDir, 'reactor.pdf'));
        expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
        expect(await readFile(path.join(outDir, 'reactor.xml'), 'utf8')).toContain('<?xml');
        expect(existsSync(path.join(outDir, 'reactor.svg'))).toBe(true);
    });

    it('honours -o for a single format', async () => {
        const file = await fixture('reactor.fpd', VALID);
        const target = path.join(dir, 'diagram.svg');
        expect(await run(['render', file, '-o', target], io)).toBe(0);
        expect(existsSync(target)).toBe(true);
    });

    it('writes nothing when the source has errors', async () => {
        const file = await fixture('broken.fpd', VALID.replace('@endfpd', ''));
        expect(await run(['render', file], io)).toBe(1);
        expect(existsSync(path.join(dir, 'broken.svg'))).toBe(false);
    });

    it.each([
        [['--format', 'png'], /unknown format 'png'/],
        [['--format', 'svg,pdf', '-o', 'x'], /single format/],
        [['-o', 'x', '--out-dir', 'y'], /either -o or --out-dir/],
        [['--orientation', 'diagonal'], /--orientation must be one of/],
        [['--bogus'], /Unknown option/],
    ])('rejects bad arguments %j', async (args, message) => {
        const file = await fixture('reactor.fpd', VALID);
        expect(await run(['render', file, ...args], io)).toBe(2);
        expect(err[0]).toMatch(message);
    });
});

describe('fpd import', () => {
    it('round-trips XML back to FPD text', async () => {
        const file = await fixture('reactor.fpd', VALID);
        const xml = path.join(dir, 'exported.xml');
        await run(['render', file, '--format', 'xml', '-o', xml], io);

        out = [];
        expect(await run(['import', xml], io)).toBe(0);
        const fpdFile = path.join(dir, 'exported.fpd');
        expect(out[0]).toContain(`-> ${fpdFile}`);

        out = [];
        expect(await run(['check', fpdFile], io)).toBe(0);
        expect(out[0]).toContain('3 states, 1 operators, 1 resources, 3 flows, 1 usages');
    });

    it('refuses to overwrite an existing file without --force', async () => {
        const file = await fixture('reactor.fpd', VALID);
        const xml = path.join(dir, 'reactor.xml');
        await run(['render', file, '--format', 'xml'], io);

        expect(await run(['import', xml], io)).toBe(2);
        expect(err[0]).toMatch(/exists; pass --force/);
        expect(await readFile(file, 'utf8')).toBe(VALID);

        expect(await run(['import', xml, '--force'], io)).toBe(0);
    });
});

describe('usage', () => {
    it('prints help without a command', async () => {
        expect(await run([], io)).toBe(0);
        expect(out).toEqual([USAGE]);
    });

    it('rejects unknown commands', async () => {
        expect(await run(['draw', 'x.fpd'], io)).toBe(2);
        expect(err[0]).toBe("fpd: unknown command 'draw'");
    });
});
