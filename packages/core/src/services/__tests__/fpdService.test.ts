import { describe, it, expect } from 'vitest';
import { FpdService } from '../../fpdService';

const VALID_SOURCE = [
    '@startfpd',
    'title "Test Process"',
    'product p1 "Raw"',
    'process_operator po1 "Cut"',
    'technical_resource tr1 "Laser"',
    'product p2 "Done"',
    'p1 --> po1',
    'po1 --> p2',
    'po1 <..> tr1',
    '@endfpd',
].join('\n');

const MINIMAL_SOURCE = '@startfpd\ntitle "Min"\n@endfpd';

describe('FpdService', () => {
    const service = new FpdService();

    // -----------------------------------------------------------------
    // parse()
    // -----------------------------------------------------------------

    describe('parse', () => {
        it('returns model and diagram for valid source', () => {
            const { model, diagram } = service.parse(VALID_SOURCE);

            expect(model.title).toBe('Test Process');
            expect(model.states).toHaveLength(2);
            expect(model.processOperators).toHaveLength(1);
            expect(model.technicalResources).toHaveLength(1);
            expect(model.flows).toHaveLength(2);
            expect(model.usages).toHaveLength(1);
            expect(model.errors).toHaveLength(0);

            expect(diagram.elements.length).toBeGreaterThanOrEqual(4);
            expect(diagram.connections.length).toBeGreaterThanOrEqual(3);
        });

        it('returns empty model for minimal source', () => {
            const { model, diagram } = service.parse(MINIMAL_SOURCE);

            expect(model.title).toBe('Min');
            expect(model.states).toHaveLength(0);
            expect(model.processOperators).toHaveLength(0);
            expect(diagram.elements).toHaveLength(0);
        });

        it('adds validation warnings to model', () => {
            // State -> State within the same system is invalid per VDI rules
            const src = [
                '@startfpd',
                'system "Sys" {',
                '  product s1',
                '  product s2',
                '  s1 --> s2',
                '}',
                '@endfpd',
            ].join('\n');
            const { model } = service.parse(src);
            expect(model.warnings.length).toBeGreaterThan(0);
        });

        it('collects parser errors without throwing', () => {
            const src = '@startfpd\nfoobar baz\n@endfpd';
            const { model } = service.parse(src);
            expect(model.errors.length).toBeGreaterThan(0);
        });
    });

    // -----------------------------------------------------------------
    // renderSvg()
    // -----------------------------------------------------------------

    describe('renderSvg', () => {
        it('returns well-formed SVG for valid source', () => {
            const svg = service.renderSvg(VALID_SOURCE);
            expect(svg).toContain('<svg');
            expect(svg).toContain('</svg>');
        });

        it('contains element labels in the SVG', () => {
            const svg = service.renderSvg(VALID_SOURCE);
            expect(svg).toContain('Cut');
            expect(svg).toContain('Laser');
        });

        it('returns SVG for minimal source (empty diagram)', () => {
            const svg = service.renderSvg(MINIMAL_SOURCE);
            expect(svg).toContain('<svg');
        });
    });

    // -----------------------------------------------------------------
    // exportSvg() — alias for renderSvg
    // -----------------------------------------------------------------

    describe('exportSvg', () => {
        it('produces the same output as renderSvg', () => {
            const rendered = service.renderSvg(VALID_SOURCE);
            const exported = service.exportSvg(VALID_SOURCE);
            expect(exported).toBe(rendered);
        });
    });

    // -----------------------------------------------------------------
    // exportXml()
    // -----------------------------------------------------------------

    describe('exportXml', () => {
        it('returns valid VDI 3682 XML with declaration', () => {
            const xml = service.exportXml(VALID_SOURCE);
            expect(xml).toContain("<?xml version='1.0'");
            expect(xml).toContain('vdivde');
        });

        it('contains element identifiers in XML', () => {
            const xml = service.exportXml(VALID_SOURCE);
            expect(xml).toContain('uniqueIdent="po1"');
            expect(xml).toContain('uniqueIdent="p1"');
            expect(xml).toContain('uniqueIdent="tr1"');
        });
    });

    // -----------------------------------------------------------------
    // exportText()
    // -----------------------------------------------------------------

    describe('exportText', () => {
        it('returns FPD text with delimiters', () => {
            const text = service.exportText(VALID_SOURCE);
            expect(text).toContain('@startfpd');
            expect(text).toContain('@endfpd');
        });

        it('preserves title', () => {
            const text = service.exportText(VALID_SOURCE);
            expect(text).toContain('title "Test Process"');
        });

        it('preserves element declarations and connections', () => {
            const text = service.exportText(VALID_SOURCE);
            expect(text).toContain('process_operator po1');
            expect(text).toContain('p1 --> po1');
            expect(text).toContain('po1 <..> tr1');
        });
    });

    // -----------------------------------------------------------------
    // exportPdf()
    // -----------------------------------------------------------------

    describe('exportPdf', () => {
        it('returns non-empty PDF bytes', async () => {
            const bytes = await service.exportPdf(VALID_SOURCE);
            expect(bytes).toBeInstanceOf(Uint8Array);
            expect(bytes.length).toBeGreaterThan(0);
            // PDF magic bytes: %PDF
            expect(bytes[0]).toBe(0x25); // %
            expect(bytes[1]).toBe(0x50); // P
            expect(bytes[2]).toBe(0x44); // D
            expect(bytes[3]).toBe(0x46); // F
        });
    });

    // -----------------------------------------------------------------
    // importFile()
    // -----------------------------------------------------------------

    describe('importFile', () => {
        it('imports FPD text via .fpd filename', () => {
            const result = service.importFile(VALID_SOURCE, 'test.fpd');
            expect(result.model.processOperators).toHaveLength(1);
            expect(result.source).toContain('@startfpd');
            expect(result.diagram.elements.length).toBeGreaterThanOrEqual(4);
        });

        it('imports XML via .xml filename (round-trip)', () => {
            const xml = service.exportXml(VALID_SOURCE);
            const result = service.importFile(xml, 'roundtrip.xml');
            expect(result.model.processOperators).toHaveLength(1);
            expect(result.model.states.length).toBeGreaterThanOrEqual(2);
            expect(result.model.technicalResources).toHaveLength(1);
            expect(result.source).toContain('@startfpd');
        });

        it('throws on undetectable format', () => {
            expect(() => service.importFile('random data', 'file.csv')).toThrow(
                /Unable to detect file format/,
            );
        });

        it('throws on invalid XML', () => {
            expect(() => service.importFile('<<<not xml>>>', 'bad.xml')).toThrow(/Invalid XML/);
        });
    });
});
