/**
 * XML importer for VDI 3682 Formalized Process Description files.
 *
 * Faithfully ported from the Python backend (import_file.py).
 * Uses a minimal regex-based XML parser to avoid external dependencies.
 */

import type { FlowType, StateType } from '../models/fpdModel';
import { STATE_TYPE_MAP, FLOW_TYPE_MAP } from '../models/constants';
import { ProcessModel, createProcessModel } from '../models/processModel';
import { exportText } from '../export/textExporter';

// ---------------------------------------------------------------------------
// Minimal XML helper (no external deps, no DOMParser)
// ---------------------------------------------------------------------------

interface XmlElement {
    tag: string; // local name (namespace prefix stripped)
    fullTag: string; // original tag including prefix
    attrs: Record<string, string>;
    children: XmlElement[];
    text: string; // direct text content
}

/**
 * Strip namespace prefix from a tag name.
 * "fpb:state" -> "state", "state" -> "state"
 */
function stripNs(tag: string): string {
    const idx = tag.indexOf(':');
    return idx >= 0 ? tag.substring(idx + 1) : tag;
}

/**
 * Parse XML attribute string into a record.
 * Handles both single and double quoted attribute values.
 */
function parseAttrs(attrString: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const re = /([a-zA-Z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(attrString)) !== null) {
        attrs[m[1]] = decodeXmlEntities(m[2] ?? m[3]);
    }
    return attrs;
}

function decodeXmlEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");
}

/**
 * Very simple recursive-descent XML parser.
 *
 * Limitations (acceptable for VDI 3682 XML):
 *   - No CDATA support
 *   - No processing instruction support beyond <?xml ... ?>
 *   - No comment nesting
 *   - Namespace prefixes are stripped for matching, but preserved in fullTag
 */
function parseXml(xml: string): XmlElement {
    // Strip XML declaration and comments
    let s = xml.replace(/<\?xml[^?]*\?>/g, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.trim();

    const elements = parseChildren(s);
    if (elements.length === 0) {
        throw new Error('Invalid XML: no root element found');
    }
    return elements[0];
}

/**
 * Parse a string that may contain multiple sibling XML elements
 * and return them as an array.
 */
function parseChildren(s: string): XmlElement[] {
    const results: XmlElement[] = [];
    let pos = 0;

    while (pos < s.length) {
        // Skip whitespace
        while (pos < s.length && /\s/.test(s[pos])) pos++;
        if (pos >= s.length) break;

        if (s[pos] !== '<') {
            // Text node - skip until next tag
            pos++;
            continue;
        }

        // Skip closing tags at this level (shouldn't happen in well-formed calls)
        if (s[pos + 1] === '/') break;

        const elem = parseElement(s, pos);
        if (elem) {
            results.push(elem.element);
            pos = elem.endPos;
        } else {
            pos++;
        }
    }

    return results;
}

function parseElement(s: string, start: number): { element: XmlElement; endPos: number } | null {
    // Match opening tag: <tagname attrs...> or <tagname attrs.../>
    const openTagRe =
        /^<([a-zA-Z_][\w:.-]*)((?:\s+[a-zA-Z_][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/;
    const sub = s.substring(start);
    const m = openTagRe.exec(sub);
    if (!m) return null;

    const fullTag = m[1];
    const tag = stripNs(fullTag);
    const attrs = parseAttrs(m[2]);
    const selfClosing = m[3] === '/';
    const afterOpen = start + m[0].length;

    if (selfClosing) {
        return {
            element: { tag, fullTag, attrs, children: [], text: '' },
            endPos: afterOpen,
        };
    }

    // Find matching close tag, accounting for nesting of same tag
    const closeTag = `</${fullTag}>`;
    let depth = 1;
    let pos = afterOpen;
    while (pos < s.length && depth > 0) {
        const nextOpen = s.indexOf(`<${fullTag}`, pos);
        const nextClose = s.indexOf(closeTag, pos);

        if (nextClose === -1) {
            // Malformed XML - just take everything
            break;
        }

        if (nextOpen !== -1 && nextOpen < nextClose) {
            // Check if this is actually an opening tag (not a different tag starting with same prefix)
            const charAfter = s[nextOpen + fullTag.length + 1];
            if (
                charAfter === '>' ||
                charAfter === ' ' ||
                charAfter === '/' ||
                charAfter === '\t' ||
                charAfter === '\n' ||
                charAfter === '\r'
            ) {
                depth++;
            }
            pos = nextOpen + 1;
        } else {
            depth--;
            if (depth === 0) {
                const innerContent = s.substring(afterOpen, nextClose);
                const children = parseChildren(innerContent);

                // Extract direct text content (text not inside child elements)
                let text = innerContent;
                // Remove child elements from text to get direct text
                text = text
                    .replace(/<[a-zA-Z_][\w:.-]*[\s\S]*?(?:\/>|<\/[a-zA-Z_][\w:.-]*>)/g, '')
                    .trim();

                return {
                    element: { tag, fullTag, attrs, children, text },
                    endPos: nextClose + closeTag.length,
                };
            }
            pos = nextClose + 1;
        }
    }

    // Fallback: malformed
    return {
        element: { tag, fullTag, attrs, children: [], text: '' },
        endPos: s.length,
    };
}

// ---------------------------------------------------------------------------
// XmlElement query helpers
// ---------------------------------------------------------------------------

/**
 * Find a direct child element by local tag name.
 */
function findChild(elem: XmlElement, localTag: string): XmlElement | undefined {
    return elem.children.find((c) => c.tag === localTag);
}

/**
 * Find all direct children by local tag name.
 */
function findChildren(elem: XmlElement, localTag: string): XmlElement[] {
    return elem.children.filter((c) => c.tag === localTag);
}

/**
 * Recursively find all descendant elements matching a local tag name.
 */
function findAll(elem: XmlElement, localTag: string): XmlElement[] {
    const results: XmlElement[] = [];
    function walk(e: XmlElement): void {
        if (e.tag === localTag) {
            results.push(e);
        }
        for (const child of e.children) {
            walk(child);
        }
    }
    walk(elem);
    return results;
}

/**
 * Find a descendant via a dot-separated path of local tag names.
 * E.g., findPath(root, 'states.state') finds the first <state> inside <states>.
 */
function findFirst(elem: XmlElement, localTag: string): XmlElement | undefined {
    if (elem.tag === localTag) return elem;
    for (const child of elem.children) {
        const found = findFirst(child, localTag);
        if (found) return found;
    }
    return undefined;
}

// ---------------------------------------------------------------------------
// Type maps (imported from shared constants)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseIdentification(elem: XmlElement): {
    uniqueId: string;
    longName: string;
    shortName: string | undefined;
} {
    const ident = findChild(elem, 'identification');
    if (!ident) {
        return { uniqueId: '', longName: '', shortName: undefined };
    }
    const uniqueId = ident.attrs['uniqueIdent'] ?? '';
    const longName = ident.attrs['longName'] ?? uniqueId;
    const shortName = ident.attrs['shortName'];
    return { uniqueId, longName, shortName };
}

// ---------------------------------------------------------------------------
// Legacy format parser
// ---------------------------------------------------------------------------

function parseXmlLegacy(root: XmlElement): ProcessModel {
    const model = createProcessModel();

    // Extract title from system limit
    const systemLimit = findFirst(root, 'systemLimit');
    if (systemLimit) {
        const ident = findChild(systemLimit, 'identification');
        if (ident) {
            model.title = ident.attrs['longName'] ?? 'Untitled Process';
        }
    }

    // Parse states: find all <state> inside <states> containers
    const statesContainers = findAll(root, 'states');
    for (const container of statesContainers) {
        for (const stateElem of findChildren(container, 'state')) {
            const stateTypeStr = stateElem.attrs['stateType'] ?? 'product';
            const stateType: StateType = STATE_TYPE_MAP[stateTypeStr] ?? 'product';
            const { uniqueId, longName, shortName } = parseIdentification(stateElem);
            if (!uniqueId) continue;
            model.states.push({
                id: uniqueId,
                stateType,
                identification: { uniqueIdent: uniqueId, longName, shortName },
                label: longName,
            });
        }
    }

    // Parse process operators
    const poContainers = findAll(root, 'processOperators');
    for (const container of poContainers) {
        for (const poElem of findChildren(container, 'processOperator')) {
            const { uniqueId, longName, shortName } = parseIdentification(poElem);
            if (!uniqueId) continue;
            model.processOperators.push({
                id: uniqueId,
                identification: { uniqueIdent: uniqueId, longName, shortName },
                label: longName,
            });
        }
    }

    // Parse technical resources
    const trContainers = findAll(root, 'technicalResources');
    for (const container of trContainers) {
        for (const trElem of findChildren(container, 'technicalResource')) {
            const { uniqueId, longName, shortName } = parseIdentification(trElem);
            if (!uniqueId) continue;
            model.technicalResources.push({
                id: uniqueId,
                identification: { uniqueIdent: uniqueId, longName, shortName },
                label: longName,
            });
        }
    }

    // Parse flows (legacy: sourceRef/targetRef children)
    const flowContainers = findAll(root, 'flowContainer');
    for (const container of flowContainers) {
        for (const flowElem of findChildren(container, 'flow')) {
            const flowId = flowElem.attrs['id'] ?? '';
            const flowTypeStr = flowElem.attrs['flowType'] ?? 'flow';
            const flowType: FlowType = FLOW_TYPE_MAP[flowTypeStr] ?? 'flow';
            const sourceRefElem = findChild(flowElem, 'sourceRef');
            const targetRefElem = findChild(flowElem, 'targetRef');
            if (!sourceRefElem || !targetRefElem) continue;
            model.flows.push({
                id: flowId,
                sourceRef: sourceRefElem.text || '',
                targetRef: targetRefElem.text || '',
                flowType,
            });
        }

        // Parse usages (legacy: sourceRef/targetRef children)
        for (const usageElem of findChildren(container, 'usage')) {
            const usageId = usageElem.attrs['id'] ?? '';
            const sourceRefElem = findChild(usageElem, 'sourceRef');
            const targetRefElem = findChild(usageElem, 'targetRef');
            if (!sourceRefElem || !targetRefElem) continue;
            model.usages.push({
                id: usageId,
                processOperatorRef: sourceRefElem.text || '',
                technicalResourceRef: targetRefElem.text || '',
            });
        }
    }

    return model;
}

// ---------------------------------------------------------------------------
// HSU format parser
// ---------------------------------------------------------------------------

function parseXmlHsu(root: XmlElement): ProcessModel {
    const model = createProcessModel();

    // SystemLimit: direct @id/@name attributes (HSU style)
    const systemLimitElem = findFirst(root, 'systemLimit');
    if (systemLimitElem) {
        let slName = systemLimitElem.attrs['name'];
        const slId = systemLimitElem.attrs['id'] ?? 'sl_1';
        if (!slName) {
            // Fallback: try nested identification (hybrid format)
            const ident = findChild(systemLimitElem, 'identification');
            slName = ident ? (ident.attrs['longName'] ?? 'Untitled Process') : 'Untitled Process';
        }
        model.title = slName;
        model.systemLimits.push({
            id: slId,
            identification: { uniqueIdent: slId, longName: slName },
            label: slName,
        });
    }

    // Parse states
    const statesContainers = findAll(root, 'states');
    for (const container of statesContainers) {
        for (const stateElem of findChildren(container, 'state')) {
            const stateTypeStr = stateElem.attrs['stateType'] ?? 'product';
            const stateType: StateType = STATE_TYPE_MAP[stateTypeStr] ?? 'product';
            const { uniqueId, longName, shortName } = parseIdentification(stateElem);
            if (!uniqueId) continue;
            model.states.push({
                id: uniqueId,
                stateType,
                identification: { uniqueIdent: uniqueId, longName, shortName },
                label: longName,
            });
        }
    }

    // Parse process operators
    const poContainers = findAll(root, 'processOperators');
    for (const container of poContainers) {
        for (const poElem of findChildren(container, 'processOperator')) {
            const { uniqueId, longName, shortName } = parseIdentification(poElem);
            if (!uniqueId) continue;
            model.processOperators.push({
                id: uniqueId,
                identification: { uniqueIdent: uniqueId, longName, shortName },
                label: longName,
            });
        }
    }

    // Parse technical resources
    const trContainers = findAll(root, 'technicalResources');
    for (const container of trContainers) {
        for (const trElem of findChildren(container, 'technicalResource')) {
            const { uniqueId, longName, shortName } = parseIdentification(trElem);
            if (!uniqueId) continue;
            model.technicalResources.push({
                id: uniqueId,
                identification: { uniqueIdent: uniqueId, longName, shortName },
                label: longName,
            });
        }
    }

    // Build flow registry from flowContainer
    const flowRegistry: Record<string, string> = {}; // flow_id -> flowType string
    const flowContainers = findAll(root, 'flowContainer');
    for (const container of flowContainers) {
        for (const fcFlow of findChildren(container, 'flow')) {
            const fid = fcFlow.attrs['id'] ?? '';
            const ftype = fcFlow.attrs['flowType'] ?? 'flow';
            if (fid) {
                flowRegistry[fid] = ftype;
            }
        }
    }

    // Reconstruct source/target from entry/exit bindings on elements.
    // Scan all per-element <flows>/<flow> children across the entire document.
    const flowSources: Record<string, string> = {}; // flow_id -> element_id (exit = source)
    const flowTargets: Record<string, string> = {}; // flow_id -> element_id (entry = target)

    const flowsContainers = findAll(root, 'flows');
    for (const container of flowsContainers) {
        for (const flowRef of findChildren(container, 'flow')) {
            const fid = flowRef.attrs['id'] ?? '';
            if (!fid) continue;
            for (const exitElem of findChildren(flowRef, 'exit')) {
                const eid = exitElem.attrs['id'] ?? '';
                if (eid) {
                    flowSources[fid] = eid;
                }
            }
            for (const entryElem of findChildren(flowRef, 'entry')) {
                const eid = entryElem.attrs['id'] ?? '';
                if (eid) {
                    flowTargets[fid] = eid;
                }
            }
        }
    }

    // Create Flow and Usage objects from the registry + bindings
    const poIds = new Set(model.processOperators.map((po) => po.id));
    const trIds = new Set(model.technicalResources.map((tr) => tr.id));

    for (const [fid, ftypeStr] of Object.entries(flowRegistry)) {
        const src = flowSources[fid] ?? '';
        const tgt = flowTargets[fid] ?? '';

        if (ftypeStr === 'usage') {
            // Determine which is PO and which is TR
            let poRef: string;
            let trRef: string;
            if (poIds.has(src)) {
                poRef = src;
                trRef = tgt;
            } else if (poIds.has(tgt)) {
                poRef = tgt;
                trRef = src;
            } else if (trIds.has(src)) {
                poRef = tgt;
                trRef = src;
            } else {
                poRef = src;
                trRef = tgt;
            }
            if (poRef && trRef) {
                model.usages.push({
                    id: fid,
                    processOperatorRef: poRef,
                    technicalResourceRef: trRef,
                });
            }
        } else {
            const flowType: FlowType = FLOW_TYPE_MAP[ftypeStr] ?? 'flow';
            if (src && tgt) {
                model.flows.push({
                    id: fid,
                    sourceRef: src,
                    targetRef: tgt,
                    flowType,
                });
            }
        }
    }

    // Assign systemId to all elements so the text exporter places them
    // inside the correct system block.
    if (model.systemLimits.length > 0) {
        const slId = model.systemLimits[0].id;
        for (const state of model.states) {
            state.systemId = slId;
        }
        for (const po of model.processOperators) {
            po.systemId = slId;
        }
        for (const tr of model.technicalResources) {
            tr.systemId = slId;
        }
        for (const flow of model.flows) {
            flow.systemId = slId;
        }
        for (const usage of model.usages) {
            usage.systemId = slId;
        }
    }

    return model;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect file format from filename extension and content.
 *
 * @returns 'text' for FPD text files, 'xml' for VDI 3682 XML files.
 * @throws Error if format cannot be determined.
 */
export function detectFormat(filename: string, content: string): 'text' | 'xml' {
    const lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.xml')) return 'xml';
    if (lowerName.endsWith('.fpd') || lowerName.endsWith('.fpb') || lowerName.endsWith('.txt'))
        return 'text';

    // Fallback: inspect content
    const stripped = content.trim();
    if (stripped.startsWith('<?xml') || stripped.startsWith('<')) return 'xml';
    if (stripped.includes('@startfpd')) return 'text';

    throw new Error('Unable to detect file format. Use .fpd, .txt, or .xml extension.');
}

/**
 * Import VDI 3682 XML content, auto-detecting HSU or legacy format.
 *
 * @returns Object containing the parsed model, generated FPD source text, and XSD warnings.
 */
export function importXml(content: string): {
    model: ProcessModel;
    source: string;
    xsdWarnings: string[];
} {
    let root: XmlElement;
    try {
        root = parseXml(content);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Invalid XML: ${msg}`);
    }

    // XSD validation is not performed in the VS Code extension (no lxml).
    const xsdWarnings: string[] = [];

    // Detect format: legacy has sourceRef children in flowContainer flows
    const flowContainers = findAll(root, 'flowContainer');
    let isLegacy = false;
    for (const container of flowContainers) {
        for (const flowElem of findChildren(container, 'flow')) {
            if (findChild(flowElem, 'sourceRef')) {
                isLegacy = true;
                break;
            }
        }
        if (isLegacy) break;
    }

    const model = isLegacy ? parseXmlLegacy(root) : parseXmlHsu(root);

    // Generate FPD text from the imported model
    const source = exportText(model);

    return { model, source, xsdWarnings };
}
