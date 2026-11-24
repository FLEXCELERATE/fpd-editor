import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
    FpdService,
    exportPdf,
    exportXml,
    renderSvg,
    type OrientationOption,
    type PageSizeOption,
    type ProcessModel,
} from '@fpd-editor/core';

export interface Io {
    out(line: string): void;
    err(line: string): void;
}

const EXIT_OK = 0;
const EXIT_FPD_ERRORS = 1;
const EXIT_USAGE = 2;

const RENDER_FORMATS = ['svg', 'pdf', 'xml'] as const;
type RenderFormat = (typeof RENDER_FORMATS)[number];

const PAGE_SIZES: readonly PageSizeOption[] = ['A4', 'Letter'];
const ORIENTATIONS: readonly OrientationOption[] = ['portrait', 'landscape'];

export const USAGE = `fpd — VDI 3682 Formalized Process Descriptions

Usage:
  fpd check  <file.fpd>
  fpd render <file.fpd> [--format svg,pdf,xml] [-o <file> | --out-dir <dir>]
                        [--page-size A4|Letter] [--orientation portrait|landscape]
  fpd import <file.xml> [-o <file.fpd>] [--force]

Exit codes: 0 ok, 1 FPD errors, 2 usage or file error.`;

class UsageError extends Error {}

const service = new FpdService();

export async function run(argv: string[], io: Io): Promise<number> {
    try {
        return await dispatch(argv, io);
    } catch (err) {
        if (err instanceof UsageError) {
            io.err(`fpd: ${err.message}`);
            io.err('Run "fpd --help" for usage.');
            return EXIT_USAGE;
        }
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'EISDIR' || code === 'EACCES') {
            io.err(`fpd: ${(err as Error).message}`);
            return EXIT_USAGE;
        }
        throw err;
    }
}

async function dispatch(argv: string[], io: Io): Promise<number> {
    const { values, positionals } = parseCliArgs(argv);
    const [command, file, ...extra] = positionals;

    if (values.help || command === undefined || command === 'help') {
        io.out(USAGE);
        return EXIT_OK;
    }
    if (!['check', 'render', 'import'].includes(command)) {
        throw new UsageError(`unknown command '${command}'`);
    }
    if (file === undefined) throw new UsageError(`'${command}' needs an input file`);
    if (extra.length > 0) throw new UsageError(`unexpected argument '${extra[0]}'`);

    if (command === 'check') return check(file, io);
    if (command === 'render') return render(file, values, io);
    return importFile(file, values, io);
}

type CliValues = ReturnType<typeof parseCliArgs>['values'];

function parseCliArgs(argv: string[]) {
    try {
        return parseArgs({
            args: argv,
            allowPositionals: true,
            strict: true,
            options: {
                format: { type: 'string', short: 'f' },
                output: { type: 'string', short: 'o' },
                'out-dir': { type: 'string' },
                'page-size': { type: 'string' },
                orientation: { type: 'string' },
                force: { type: 'boolean' },
                help: { type: 'boolean', short: 'h' },
            },
        });
    } catch (err) {
        throw new UsageError((err as Error).message);
    }
}

function summarize(model: ProcessModel): string {
    return (
        `"${model.title}": ${model.states.length} states, ` +
        `${model.processOperators.length} operators, ` +
        `${model.technicalResources.length} resources, ` +
        `${model.flows.length} flows, ${model.usages.length} usages`
    );
}

/** Prints errors and warnings; returns true when the model has blocking errors. */
function report(model: ProcessModel, io: Io): boolean {
    for (const e of model.errors) io.err(`ERROR ${e}`);
    for (const w of model.warnings) io.err(`WARN  ${w}`);
    if (model.errors.length > 0) {
        io.err(`FAIL ${model.errors.length} error(s)`);
        return true;
    }
    return false;
}

async function check(file: string, io: Io): Promise<number> {
    const { model } = service.parse(await readFile(file, 'utf8'));
    if (report(model, io)) return EXIT_FPD_ERRORS;
    io.out(`OK ${summarize(model)}`);
    return EXIT_OK;
}

function parseFormats(raw: string | undefined): RenderFormat[] {
    if (raw === undefined) return ['svg'];
    const formats = raw
        .split(',')
        .map((f) => f.trim().toLowerCase())
        .filter(Boolean);
    for (const f of formats) {
        if (!(RENDER_FORMATS as readonly string[]).includes(f)) {
            throw new UsageError(`unknown format '${f}' (expected ${RENDER_FORMATS.join(', ')})`);
        }
    }
    if (formats.length === 0) throw new UsageError('--format is empty');
    return [...new Set(formats)] as RenderFormat[];
}

function pickOption<T extends string>(
    name: string,
    raw: string | undefined,
    allowed: readonly T[],
) {
    if (raw === undefined) return undefined;
    const match = allowed.find((a) => a.toLowerCase() === raw.toLowerCase());
    if (match === undefined) {
        throw new UsageError(`--${name} must be one of ${allowed.join(', ')}`);
    }
    return match;
}

function stem(file: string): string {
    return path.basename(file, path.extname(file));
}

async function render(file: string, values: CliValues, io: Io): Promise<number> {
    const formats = parseFormats(values.format);
    if (values.output !== undefined && values['out-dir'] !== undefined) {
        throw new UsageError('use either -o or --out-dir, not both');
    }
    if (values.output !== undefined && formats.length > 1) {
        throw new UsageError('-o takes a single format; use --out-dir for several');
    }
    const pageSize = pickOption('page-size', values['page-size'], PAGE_SIZES);
    const orientation = pickOption('orientation', values.orientation, ORIENTATIONS);

    const { model, diagram } = service.parse(await readFile(file, 'utf8'));
    if (report(model, io)) return EXIT_FPD_ERRORS;

    const outDir = values['out-dir'] ?? path.dirname(file);
    if (values['out-dir'] !== undefined) await mkdir(outDir, { recursive: true });

    const written: string[] = [];
    for (const format of formats) {
        const target = values.output ?? path.join(outDir, `${stem(file)}.${format}`);
        if (format === 'svg') {
            await writeFile(target, renderSvg(diagram), 'utf8');
        } else if (format === 'xml') {
            await writeFile(target, exportXml(model), 'utf8');
        } else {
            const pdf = await exportPdf(diagram, { title: model.title, pageSize, orientation });
            await writeFile(target, pdf);
        }
        written.push(target);
    }

    io.out(`OK ${summarize(model)} -> ${written.join(', ')}`);
    return EXIT_OK;
}

async function importFile(file: string, values: CliValues, io: Io): Promise<number> {
    const target = values.output ?? path.join(path.dirname(file), `${stem(file)}.fpd`);
    if (path.resolve(target) === path.resolve(file)) {
        throw new UsageError('output would overwrite the input file');
    }
    if (existsSync(target) && !values.force) {
        throw new UsageError(`${target} exists; pass --force to overwrite`);
    }

    const { model, source } = service.importFile(await readFile(file, 'utf8'), file);
    if (report(model, io)) return EXIT_FPD_ERRORS;

    await writeFile(target, source, 'utf8');
    io.out(`OK ${summarize(model)} -> ${target}`);
    return EXIT_OK;
}
