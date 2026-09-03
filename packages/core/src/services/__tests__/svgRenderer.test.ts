import { describe, it, expect } from 'vitest';
import { renderSvg } from '../svgRenderer';
import { DiagramLayout, LayoutElement, LayoutConnection, SystemLimitRect } from '../layout';
import { FpdService } from '../../fpdService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(
    id: string,
    type: 'state' | 'processOperator' | 'technicalResource',
    x: number,
    y: number,
    opts: Partial<LayoutElement> = {},
): LayoutElement {
    const isState = type === 'state';
    return {
        id,
        type,
        label: id,
        x,
        y,
        width: isState ? 55 : 150,
        height: isState ? 50 : 80,
        ...opts,
    };
}

function makeConnection(
    sourceId: string,
    targetId: string,
    opts: Partial<LayoutConnection> = {},
): LayoutConnection {
    return {
        id: `${sourceId}_${targetId}`,
        sourceId,
        targetId,
        isUsage: false,
        ...opts,
    };
}

function makeLayout(
    elements: LayoutElement[],
    connections: LayoutConnection[] = [],
    systemLimits: SystemLimitRect[] = [],
): DiagramLayout {
    return {
        elements,
        connections,
        systemLimits,
        systemLimit: systemLimits.length > 0 ? systemLimits[0] : null,
    };
}

function countOccurrences(haystack: string, needle: string): number {
    return haystack.split(needle).length - 1;
}

function extractElementGroup(svg: string, id: string): string {
    const re = new RegExp(`<g [^>]*data-element-id="${id}"[^>]*>[\\s\\S]*?</g>`);
    const m = svg.match(re);
    if (!m) throw new Error(`No <g> with data-element-id="${id}" found in SVG`);
    return m[0];
}

function extractConnectionPath(svg: string, connId: string): string {
    const re = new RegExp(`<path [^>]*data-connection-id="${connId}"[^>]*/>`);
    const m = svg.match(re);
    if (!m) throw new Error(`No <path> with data-connection-id="${connId}" found in SVG`);
    return m[0];
}

function extractMarkerEnd(path: string): string {
    const m = path.match(/marker-end="url\(#([^)]+)\)"/);
    if (!m) throw new Error(`No marker-end found on path: ${path}`);
    return m[1];
}

/**
 * Minimal XML well-formedness assertion (the vitest environment is node,
 * so there is no DOMParser): every tag must be lexically valid, opening
 * and closing tags must balance, and no stray '<' or '>' may appear in
 * text content.
 */
function assertWellFormedXml(svg: string): void {
    const tagRe = /<(\/?)([A-Za-z][\w.:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
    const stack: string[] = [];
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(svg)) !== null) {
        const textBetween = svg.slice(lastIndex, m.index);
        expect(textBetween, `stray '<' in text content: ${textBetween}`).not.toContain('<');
        expect(textBetween, `stray '>' in text content: ${textBetween}`).not.toContain('>');
        lastIndex = tagRe.lastIndex;

        const closing = m[1] === '/';
        const name = m[2];
        const selfClosing = m[4] === '/';
        if (closing) {
            expect(stack.pop(), `unbalanced closing tag </${name}>`).toBe(name);
        } else if (!selfClosing) {
            stack.push(name);
        }
    }
    const tail = svg.slice(lastIndex);
    expect(tail, `stray '<' after last tag: ${tail}`).not.toContain('<');
    expect(stack, 'unclosed tags remain').toEqual([]);
    // Every ampersand must be part of a valid entity reference.
    expect(svg).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/);
}

/** A tiny state -> PO -> state layout with one TR and a usage connection. */
function smallLayout(): DiagramLayout {
    const sIn = makeElement('s_in', 'state', 100, 0, { stateType: 'product' });
    const po = makeElement('po1', 'processOperator', 50, 150);
    const sOut = makeElement('s_out', 'state', 100, 330, { stateType: 'product' });
    const tr = makeElement('tr1', 'technicalResource', 300, 150);
    return makeLayout(
        [sIn, po, sOut, tr],
        [
            makeConnection('s_in', 'po1'),
            makeConnection('po1', 's_out'),
            makeConnection('po1', 'tr1', { isUsage: true }),
        ],
    );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderSvg', () => {
    // -----------------------------------------------------------------------
    // 1. Empty diagram
    // -----------------------------------------------------------------------

    describe('empty diagram', () => {
        it('returns a placeholder SVG when there are no elements', () => {
            const svg = renderSvg(makeLayout([]));
            expect(svg.startsWith('<svg')).toBe(true);
            expect(svg.endsWith('</svg>')).toBe(true);
            expect(svg).toContain('No diagram to display');
            expect(svg).not.toContain('data-element-id');
        });

        it('placeholder SVG is well-formed XML', () => {
            assertWellFormedXml(renderSvg(makeLayout([])));
        });
    });

    // -----------------------------------------------------------------------
    // 2. Element rendering
    // -----------------------------------------------------------------------

    describe('element rendering', () => {
        it('renders exactly one group per element with correct data attributes', () => {
            const svg = renderSvg(smallLayout());

            expect(countOccurrences(svg, 'data-element-id=')).toBe(4);

            const sIn = extractElementGroup(svg, 's_in');
            expect(sIn).toContain('data-element-type="state"');

            const po = extractElementGroup(svg, 'po1');
            expect(po).toContain('data-element-type="processOperator"');

            const tr = extractElementGroup(svg, 'tr1');
            expect(tr).toContain('data-element-type="technicalResource"');
        });

        it('renders product states as circles', () => {
            const layout = makeLayout([makeElement('p1', 'state', 0, 0, { stateType: 'product' })]);
            const g = extractElementGroup(renderSvg(layout), 'p1');
            expect(g).toContain('<circle');
            expect(g).not.toContain('<polygon');
            expect(g).toContain('data-state-type="product"');
        });

        it('renders energy states as 4-point polygons (diamond)', () => {
            const layout = makeLayout([makeElement('e1', 'state', 0, 0, { stateType: 'energy' })]);
            const g = extractElementGroup(renderSvg(layout), 'e1');
            expect(g).toContain('<polygon');
            expect(g).not.toContain('<circle');
            expect(g).toContain('data-state-type="energy"');

            const points = g
                .match(/points="([^"]+)"/)![1]
                .trim()
                .split(/\s+/);
            expect(points).toHaveLength(4);
        });

        it('renders information states as 6-point polygons (hexagon)', () => {
            const layout = makeLayout([
                makeElement('i1', 'state', 0, 0, { stateType: 'information' }),
            ]);
            const g = extractElementGroup(renderSvg(layout), 'i1');
            expect(g).toContain('<polygon');
            expect(g).not.toContain('<circle');
            expect(g).toContain('data-state-type="information"');

            const points = g
                .match(/points="([^"]+)"/)![1]
                .trim()
                .split(/\s+/);
            expect(points).toHaveLength(6);
        });

        it('renders shapes that differ between the three state types', () => {
            const layout = makeLayout([
                makeElement('p1', 'state', 0, 0, { stateType: 'product' }),
                makeElement('e1', 'state', 200, 0, { stateType: 'energy' }),
                makeElement('i1', 'state', 400, 0, { stateType: 'information' }),
            ]);
            const svg = renderSvg(layout);
            const product = extractElementGroup(svg, 'p1');
            const energy = extractElementGroup(svg, 'e1');
            const information = extractElementGroup(svg, 'i1');

            expect(product).toContain('<circle');
            expect(energy).toContain('<polygon');
            expect(information).toContain('<polygon');
            // Energy (diamond) and information (hexagon) polygons must differ in vertex count
            const energyPoints = energy
                .match(/points="([^"]+)"/)![1]
                .trim()
                .split(/\s+/);
            const infoPoints = information
                .match(/points="([^"]+)"/)![1]
                .trim()
                .split(/\s+/);
            expect(energyPoints.length).not.toBe(infoPoints.length);
        });

        it('renders POs and TRs as rects with their labels as text', () => {
            const layout = makeLayout([
                makeElement('po1', 'processOperator', 0, 0, { label: 'Cutting' }),
                makeElement('tr1', 'technicalResource', 300, 0, { label: 'Laser' }),
            ]);
            const svg = renderSvg(layout);

            const po = extractElementGroup(svg, 'po1');
            expect(po).toContain('<rect');
            expect(po).toContain('Cutting');
            expect(po).toContain('po1');

            const tr = extractElementGroup(svg, 'tr1');
            expect(tr).toContain('<rect');
            expect(tr).toContain('Laser');
        });

        it('includes data-line-number when the element has one', () => {
            const layout = makeLayout([
                makeElement('po1', 'processOperator', 0, 0, { lineNumber: 7 }),
            ]);
            const g = extractElementGroup(renderSvg(layout), 'po1');
            expect(g).toContain('data-line-number="7"');
        });
    });

    // -----------------------------------------------------------------------
    // 3. XML escaping (security regression tests)
    // -----------------------------------------------------------------------

    describe('XML escaping', () => {
        it('escapes <script> injected via element id and label', () => {
            const evil = '<script>alert(1)</script>';
            const layout = makeLayout([
                makeElement(evil, 'state', 0, 0, { stateType: 'product', label: evil }),
            ]);
            const svg = renderSvg(layout);

            expect(svg).not.toContain('<script');
            expect(svg).not.toContain('</script');
            expect(svg).toContain('&lt;script&gt;');
            assertWellFormedXml(svg);
        });

        it('escapes ampersands and quotes in labels', () => {
            const layout = makeLayout([
                makeElement('po1', 'processOperator', 0, 0, {
                    label: 'Cut & "Weld" \'fast\'',
                }),
            ]);
            const svg = renderSvg(layout);

            expect(svg).toContain('&amp;');
            expect(svg).toContain('&quot;Weld&quot;');
            expect(svg).toContain('&apos;fast&apos;');
            expect(svg).not.toContain('Cut & "Weld"');
            assertWellFormedXml(svg);
        });

        it('escapes malicious connection ids (attribute breakout)', () => {
            const sIn = makeElement('a', 'state', 100, 0);
            const po = makeElement('b', 'processOperator', 50, 150);
            const evilConnId = 'c"><script>alert(1)</script>';
            const layout = makeLayout([sIn, po], [makeConnection('a', 'b', { id: evilConnId })]);
            const svg = renderSvg(layout);

            expect(svg).not.toContain('<script');
            expect(svg).toContain('&quot;&gt;&lt;script&gt;');
            assertWellFormedXml(svg);
        });

        it('escapes system limit labels', () => {
            const layout = makeLayout(
                [makeElement('po1', 'processOperator', 100, 100)],
                [],
                [{ id: 'sys1', label: 'A & B <System>', x: 50, y: 50, width: 300, height: 200 }],
            );
            const svg = renderSvg(layout);

            expect(svg).toContain('A &amp; B &lt;System&gt;');
            expect(svg).not.toContain('A & B <System>');
            assertWellFormedXml(svg);
        });
    });

    // -----------------------------------------------------------------------
    // 4. Connection rendering
    // -----------------------------------------------------------------------

    describe('connection rendering', () => {
        it('renders a regular flow as a path with data-connection-id and the flow arrow marker', () => {
            const svg = renderSvg(smallLayout());
            const path = extractConnectionPath(svg, 's_in_po1');

            expect(path).toContain('d="M ');
            expect(path).toContain('fill="none"');
            const marker = extractMarkerEnd(path);
            expect(marker).toBe('arrow-flow');
            // The referenced marker must be defined in <defs>
            expect(svg).toContain(`<marker id="${marker}"`);
        });

        it('renders usage connections with arrow markers at both ends', () => {
            const svg = renderSvg(smallLayout());
            const path = extractConnectionPath(svg, 'po1_tr1');

            const startMarker = path.match(/marker-start="url\(#([^)]+)\)"/);
            expect(startMarker).not.toBeNull();
            const endMarker = extractMarkerEnd(path);
            // Usage is bidirectional: same marker on both ends
            expect(startMarker![1]).toBe(endMarker);
            expect(svg).toContain(`<marker id="${endMarker}"`);
        });

        it('renders cross-system connections with a dedicated marker, undashed', () => {
            const a = makeElement('a', 'state', 100, 0);
            const b = makeElement('b', 'state', 100, 300);
            const layout = makeLayout([a, b], [makeConnection('a', 'b', { isCrossSystem: true })]);
            const svg = renderSvg(layout);
            const path = extractConnectionPath(svg, 'a_b');

            const marker = extractMarkerEnd(path);
            expect(marker).toBe('arrow-crossSystem');
            expect(svg).toContain(`<marker id="${marker}"`);
            // Dashing is reserved for resource assignment; a cross-system flow is
            // still a flow, so it is drawn solid and black like any other.
            expect(path).not.toContain('stroke-dasharray');
        });

        it('renders alternative and parallel flows with markers distinct from the regular flow marker', () => {
            const po = makeElement('po1', 'processOperator', 50, 0);
            const s1 = makeElement('s1', 'state', 0, 200);
            const s2 = makeElement('s2', 'state', 100, 200);
            const s3 = makeElement('s3', 'state', 200, 200);
            const layout = makeLayout(
                [po, s1, s2, s3],
                [
                    makeConnection('po1', 's1'),
                    makeConnection('po1', 's2', { flowType: 'alternativeFlow' }),
                    makeConnection('po1', 's3', { flowType: 'parallelFlow' }),
                ],
            );
            const svg = renderSvg(layout);

            const flowMarker = extractMarkerEnd(extractConnectionPath(svg, 'po1_s1'));
            const altMarker = extractMarkerEnd(extractConnectionPath(svg, 'po1_s2'));
            const parMarker = extractMarkerEnd(extractConnectionPath(svg, 'po1_s3'));

            // Structural facts: three distinct markers, all defined in defs.
            expect(altMarker).not.toBe(flowMarker);
            expect(parMarker).not.toBe(flowMarker);
            expect(altMarker).not.toBe(parMarker);
            for (const marker of [flowMarker, altMarker, parMarker]) {
                expect(svg).toContain(`<marker id="${marker}"`);
            }
        });

        it('skips connections whose endpoints do not exist', () => {
            const layout = makeLayout(
                [makeElement('a', 'state', 0, 0)],
                [makeConnection('a', 'ghost'), makeConnection('ghost', 'a')],
            );
            const svg = renderSvg(layout);
            expect(countOccurrences(svg, 'data-connection-id=')).toBe(0);
            assertWellFormedXml(svg);
        });

        it('renders one path per resolvable connection', () => {
            const svg = renderSvg(smallLayout());
            expect(countOccurrences(svg, 'data-connection-id=')).toBe(3);
        });
    });

    // -----------------------------------------------------------------------
    // 5. System limits
    // -----------------------------------------------------------------------

    describe('system limits', () => {
        it('renders a dashed, unfilled rect at the system limit geometry', () => {
            const layout = makeLayout(
                [makeElement('po1', 'processOperator', 100, 100)],
                [],
                [{ id: 'sys1', label: 'Plant', x: 10, y: 20, width: 400, height: 300 }],
            );
            const svg = renderSvg(layout);

            const rectRe = /<rect x="10" y="20" width="400" height="300" [^>]*\/>/;
            const m = svg.match(rectRe);
            expect(m).not.toBeNull();
            expect(m![0]).toContain('fill="none"');
            expect(m![0]).toContain('stroke-dasharray');
        });

        it('renders the system limit label text', () => {
            const layout = makeLayout(
                [makeElement('po1', 'processOperator', 100, 100)],
                [],
                [
                    {
                        id: 'sys1',
                        label: 'Manufacturing Cell',
                        x: 10,
                        y: 20,
                        width: 400,
                        height: 300,
                    },
                ],
            );
            const svg = renderSvg(layout);
            expect(svg).toContain('Manufacturing Cell');
        });

        it('renders one rect per system limit', () => {
            const layout = makeLayout(
                [
                    makeElement('po1', 'processOperator', 100, 100),
                    makeElement('po2', 'processOperator', 600, 100),
                ],
                [],
                [
                    { id: 'sys1', label: 'Sys 1', x: 50, y: 50, width: 300, height: 200 },
                    { id: 'sys2', label: 'Sys 2', x: 550, y: 50, width: 300, height: 200 },
                ],
            );
            const svg = renderSvg(layout);
            expect(svg).toContain('Sys 1');
            expect(svg).toContain('Sys 2');
            // Structural: at least two unfilled (border-only) rects
            const dashedRects = svg.match(/<rect [^>]*fill="none"[^>]*\/>/g) || [];
            expect(dashedRects.length).toBeGreaterThanOrEqual(2);
        });
    });

    // -----------------------------------------------------------------------
    // 6. Document structure
    // -----------------------------------------------------------------------

    describe('document structure', () => {
        it('produces well-formed XML for a full diagram', () => {
            const layout = smallLayout();
            layout.systemLimits.push({
                id: 'sys1',
                label: 'System',
                x: 0,
                y: -50,
                width: 500,
                height: 500,
            });
            assertWellFormedXml(renderSvg(layout));
        });

        it('has a viewBox with four finite numbers and positive size', () => {
            const svg = renderSvg(smallLayout());
            const m = svg.match(/viewBox="([^"]+)"/);
            expect(m).not.toBeNull();

            const parts = m![1].trim().split(/\s+/).map(Number);
            expect(parts).toHaveLength(4);
            for (const n of parts) {
                expect(Number.isFinite(n)).toBe(true);
            }
            expect(parts[2]).toBeGreaterThan(0); // width
            expect(parts[3]).toBeGreaterThan(0); // height
        });

        it('viewBox encloses all element geometry', () => {
            const layout = smallLayout();
            const svg = renderSvg(layout);
            const [vx, vy, vw, vh] = svg
                .match(/viewBox="([^"]+)"/)![1]
                .trim()
                .split(/\s+/)
                .map(Number);

            for (const el of layout.elements) {
                expect(el.x).toBeGreaterThanOrEqual(vx);
                expect(el.y).toBeGreaterThanOrEqual(vy);
                expect(el.x + el.width).toBeLessThanOrEqual(vx + vw);
                expect(el.y + el.height).toBeLessThanOrEqual(vy + vh);
            }
        });

        it('declares the SVG namespace and defines markers before use', () => {
            const svg = renderSvg(smallLayout());
            expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
            const defsIdx = svg.indexOf('<defs>');
            const firstPathIdx = svg.indexOf('data-connection-id=');
            expect(defsIdx).toBeGreaterThan(-1);
            expect(firstPathIdx).toBeGreaterThan(defsIdx);
        });
    });

    // -----------------------------------------------------------------------
    // 7. Integration via FpdService (parse -> layout -> render)
    // -----------------------------------------------------------------------

    describe('integration with FpdService', () => {
        const service = new FpdService();
        const SOURCE = [
            '@startfpd',
            'title "Render Test"',
            'product raw "Raw Material"',
            'energy power',
            'process_operator cut "Cutting"',
            'technical_resource laser "Laser"',
            'product done "Finished"',
            'raw --> cut',
            'power --> cut',
            'cut --> done',
            'cut <..> laser',
            '@endfpd',
        ].join('\n');

        it('renders one group per layout element and one path per connection', () => {
            const { diagram } = service.parse(SOURCE);
            const svg = renderSvg(diagram);

            expect(countOccurrences(svg, 'data-element-id=')).toBe(diagram.elements.length);
            expect(countOccurrences(svg, 'data-connection-id=')).toBe(diagram.connections.length);
        });

        it('renders each parsed element type with its data-element-type', () => {
            const { diagram } = service.parse(SOURCE);
            const svg = renderSvg(diagram);

            expect(extractElementGroup(svg, 'raw')).toContain('data-element-type="state"');
            expect(extractElementGroup(svg, 'cut')).toContain(
                'data-element-type="processOperator"',
            );
            expect(extractElementGroup(svg, 'laser')).toContain(
                'data-element-type="technicalResource"',
            );
            expect(extractElementGroup(svg, 'power')).toContain('data-state-type="energy"');
        });

        it('produces well-formed XML from parsed source', () => {
            assertWellFormedXml(service.renderSvg(SOURCE));
        });
    });
});
