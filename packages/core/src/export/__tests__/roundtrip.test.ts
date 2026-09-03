import { describe, it, expect } from 'vitest';
import { FpdService } from '../../fpdService';
import type { ProcessModel } from '../../models/processModel';

/**
 * Export/import roundtrips.
 *
 * The FPD text format is the primary save format, so a roundtrip through it has
 * to be lossless — anything it drops is destroyed the next time the user saves.
 * VDI 3682 XML is an interchange format and cannot carry everything the text
 * format can; what it does carry is pinned here, and the known gaps are listed
 * as todos rather than asserted, so fixing one does not fail the suite.
 */

const svc = new FpdService();

/** Every element and flow kind, no system block. */
const FLAT = [
    '@startfpd',
    'title "Roundtrip"',
    'product P1 "Rohstoff"',
    'energy E1 "Elektrische Energie"',
    'information I1 "Druck"',
    'product P2 "Zwischenprodukt"',
    'product P3 "Alternative"',
    'product P4 "Parallel"',
    'product P5 "Abfall" @boundary-bottom',
    'information I2 "Messwert" @boundary-right',
    'process_operator O1 "Schritt Eins"',
    'process_operator O2 "Schritt Zwei"',
    'technical_resource R1 "Pumpe"',
    'P1 --> O1',
    'E1 --> O1',
    'I1 --> O1',
    'O1 --> P2',
    'P2 --> O2',
    'O2 -.-> P3',
    'O2 ==> P4',
    'O2 --> P5',
    'O2 --> I2',
    'R1 <..> O1',
    '@endfpd',
].join('\n');

/** Everything inside one system block. */
const NESTED = [
    '@startfpd',
    'title "Roundtrip"',
    'system "Anlage X" {',
    '  product P1 "Rohstoff"',
    '  energy E1 "Elektrische Energie"',
    '  product P2 "Zwischenprodukt"',
    '  product P5 "Abfall" @boundary-bottom',
    '  process_operator O1 "Schritt Eins"',
    '  technical_resource R1 "Pumpe"',
    '  P1 --> O1',
    '  E1 --> O1',
    '  O1 --> P2',
    '  O1 --> P5',
    '  R1 <..> O1',
    '}',
    '@endfpd',
].join('\n');

/**
 * States declared outside a system block whose flows sit inside it. The parser
 * accepts this, and the text export used to drop the declarations — which took
 * the flows referencing them down with it on the next read.
 */
const MIXED = [
    '@startfpd',
    'title "Gemischt"',
    'product P1 "Rohstoff"',
    'product P2 "Zwischenprodukt"',
    'energy E1 "Strom"',
    'technical_resource R1 "Pumpe"',
    'system "Anlage X" {',
    '  process_operator O1 "Schritt Eins"',
    '}',
    'P1 --> O1',
    'E1 --> O1',
    'O1 --> P2',
    'R1 <..> O1',
    '@endfpd',
].join('\n');

const DOCUMENTS: [string, string][] = [
    ['flat', FLAT],
    ['nested in a system', NESTED],
    ['mixed inside and outside a system', MIXED],
];

function parse(source: string): ProcessModel {
    return svc.parse(source).model as ProcessModel;
}

/** The parts of a model a save format must carry, in a comparable shape. */
function fingerprint(model: ProcessModel) {
    const sorted = <T>(items: T[], key: (item: T) => string) =>
        items.map(key).sort((a, b) => a.localeCompare(b));
    return {
        title: model.title,
        states: sorted(
            model.states,
            (s) => `${s.id}|${s.stateType}|${s.label ?? ''}|${s.placement ?? ''}`,
        ),
        processOperators: sorted(model.processOperators, (p) => `${p.id}|${p.label ?? ''}`),
        technicalResources: sorted(model.technicalResources, (t) => `${t.id}|${t.label ?? ''}`),
        flows: sorted(model.flows, (f) => `${f.sourceRef}|${f.flowType ?? 'flow'}|${f.targetRef}`),
        usages: sorted(model.usages, (u) => `${u.processOperatorRef}|${u.technicalResourceRef}`),
        systemLimits: sorted(model.systemLimits, (s) => `${s.label ?? ''}`),
    };
}

describe('FPD text roundtrip', () => {
    for (const [name, source] of DOCUMENTS) {
        it(`preserves everything — ${name}`, () => {
            const original = parse(source);
            const reparsed = parse(svc.exportText(source));
            expect(fingerprint(reparsed)).toEqual(fingerprint(original));
        });
    }

    it('re-exports to identical text the second time round', () => {
        // A stable fixed point: saving a file that was just saved changes nothing.
        const once = svc.exportText(FLAT);
        const twice = svc.exportText(once);
        expect(twice).toBe(once);
    });

    it('keeps elements that belong to no system when a system block exists', () => {
        const model = parse(MIXED);
        expect(model.systemLimits.length).toBe(1);
        expect(model.states.some((s) => s.systemId === undefined)).toBe(true);

        const text = svc.exportText(MIXED);
        for (const id of ['P1', 'P2', 'E1', 'R1']) {
            expect(text).toContain(id);
        }
        const reparsed = parse(text);
        expect(reparsed.states).toHaveLength(model.states.length);
        expect(reparsed.flows).toHaveLength(model.flows.length);
        expect(reparsed.usages).toHaveLength(model.usages.length);
    });
});

describe('VDI 3682 XML roundtrip', () => {
    function importXmlOf(source: string): ProcessModel {
        const xml = svc.exportXml(source);
        const result = svc.importFile(xml, 'export.xml') as { model?: ProcessModel };
        return (result.model ?? (result as unknown as ProcessModel)) as ProcessModel;
    }

    for (const [name, source] of DOCUMENTS) {
        it(`carries states, operators, resources and flows — ${name}`, () => {
            const original = parse(source);
            const back = importXmlOf(source);

            const ids = (items: { id: string }[]) => items.map((i) => i.id).sort();
            expect(ids(back.states)).toEqual(ids(original.states));
            expect(ids(back.processOperators)).toEqual(ids(original.processOperators));
            expect(ids(back.technicalResources)).toEqual(ids(original.technicalResources));

            const flows = (m: ProcessModel) =>
                m.flows.map((f) => `${f.sourceRef}|${f.flowType ?? 'flow'}|${f.targetRef}`).sort();
            expect(flows(back)).toEqual(flows(original));

            const typed = (m: ProcessModel) =>
                m.states.map((s) => `${s.id}|${s.stateType}|${s.label ?? ''}`).sort();
            expect(typed(back)).toEqual(typed(original));
        });
    }

    // Known gaps, each reproducible with the documents above. Recorded rather
    // than asserted so that closing one does not fail this suite.
    it.todo('preserves @boundary placement hints (the XML has no attribute for them)');
    it.todo('preserves technical resource usages (dropped on import)');
    it.todo('keeps the document title distinct from the system limit name');
    it.todo('does not invent a system limit for a document that declares none');
});

describe('binary and vector exports', () => {
    it('produces a well-formed SVG document', () => {
        const svg = svc.exportSvg(FLAT);
        expect(svg.trimStart().startsWith('<svg')).toBe(true);
        expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
        expect(svg).toContain('viewBox=');
    });

    it('produces a PDF with the expected header', async () => {
        const pdf = await svc.exportPdf(FLAT);
        expect(pdf.length).toBeGreaterThan(1000);
        expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    });

    it('exports every document without throwing', async () => {
        for (const [, source] of DOCUMENTS) {
            expect(() => svc.exportSvg(source)).not.toThrow();
            expect(() => svc.exportXml(source)).not.toThrow();
            expect(() => svc.exportText(source)).not.toThrow();
            await expect(svc.exportPdf(source)).resolves.toBeInstanceOf(Uint8Array);
        }
    });
});
