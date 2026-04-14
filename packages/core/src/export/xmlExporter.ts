/**
 * XML exporter producing HSU FPD_Schema.xsd-compatible VDI 3682 XML.
 *
 * The output follows the distributed flow architecture defined by the HSU Hamburg
 * FPD_Schema.xsd (https://github.com/hsu-aut/IndustrialStandard-XSD-VDI3682):
 *
 * - flowContainer holds flow registrations (id + flowType) — no sourceRef/targetRef
 * - Each element has its own <flows> child with <entry>/<exit> bindings
 * - Usages appear as flowType="usage" in flowContainer and per-element <usages>
 * - SystemLimit uses direct @id/@name attributes
 * - identification always includes a <references/> child
 */

import { Flow, Usage } from '../models/fpdModel';
import { STATE_TYPE_MAP, FLOW_TYPE_MAP } from '../models/constants';
import { ProcessModel } from '../models/processModel';
import { escapeXml } from '../utils';

const VDI3682_NAMESPACE = 'http://www.vdivde.de/3682';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';
const FPB_PREFIX = 'fpb';

function fpbTag(localName: string): string {
    return `${FPB_PREFIX}:${localName}`;
}

function identificationXml(
    indent: string,
    uniqueIdent: string,
    longName?: string | null,
    shortName?: string | null,
): string {
    const attrs: string[] = [`uniqueIdent="${escapeXml(uniqueIdent)}"`];
    if (longName) {
        attrs.push(`longName="${escapeXml(longName)}"`);
    }
    if (shortName) {
        attrs.push(`shortName="${escapeXml(shortName)}"`);
    }
    const lines: string[] = [];
    lines.push(`${indent}<${fpbTag('identification')} ${attrs.join(' ')}>`);
    lines.push(`${indent}  <${fpbTag('references')}/>`);
    lines.push(`${indent}</${fpbTag('identification')}>`);
    return lines.join('\n');
}

function emptyChildrenXml(indent: string, ...names: string[]): string {
    return names.map((name) => `${indent}<${fpbTag(name)}/>`).join('\n');
}

function flowsElementXml(
    indent: string,
    elementId: string,
    flowsAsSource: Flow[],
    flowsAsTarget: Flow[],
): string {
    const lines: string[] = [];
    lines.push(`${indent}<${fpbTag('flows')}>`);
    for (const flow of flowsAsSource) {
        lines.push(`${indent}  <${fpbTag('flow')} id="${escapeXml(flow.id)}">`);
        lines.push(`${indent}    <${fpbTag('exit')} id="${escapeXml(elementId)}"/>`);
        lines.push(`${indent}  </${fpbTag('flow')}>`);
    }
    for (const flow of flowsAsTarget) {
        lines.push(`${indent}  <${fpbTag('flow')} id="${escapeXml(flow.id)}">`);
        lines.push(`${indent}    <${fpbTag('entry')} id="${escapeXml(elementId)}"/>`);
        lines.push(`${indent}  </${fpbTag('flow')}>`);
    }
    lines.push(`${indent}</${fpbTag('flows')}>`);
    return lines.join('\n');
}

function usagesElementXml(indent: string, usagesList: Usage[]): string {
    const lines: string[] = [];
    lines.push(`${indent}<${fpbTag('usages')}>`);
    for (const usage of usagesList) {
        lines.push(`${indent}  <${fpbTag('usage')} id="${escapeXml(usage.id)}"/>`);
    }
    lines.push(`${indent}</${fpbTag('usages')}>`);
    return lines.join('\n');
}

/**
 * Convert a ProcessModel to HSU FPD_Schema.xsd-compatible XML.
 *
 * @param model - The process model to export.
 * @returns A string containing VDI 3682 XML compatible with the HSU schema.
 */
export function exportXml(model: ProcessModel): string {
    // --- Build lookup indices ---
    const sourceFlows: Record<string, Flow[]> = {};
    const targetFlows: Record<string, Flow[]> = {};
    for (const flow of model.flows) {
        if (!sourceFlows[flow.sourceRef]) {
            sourceFlows[flow.sourceRef] = [];
        }
        sourceFlows[flow.sourceRef].push(flow);
        if (!targetFlows[flow.targetRef]) {
            targetFlows[flow.targetRef] = [];
        }
        targetFlows[flow.targetRef].push(flow);
    }

    const poUsages: Record<string, Usage[]> = {};
    const trUsages: Record<string, Usage[]> = {};
    for (const usage of model.usages) {
        if (!poUsages[usage.processOperatorRef]) {
            poUsages[usage.processOperatorRef] = [];
        }
        poUsages[usage.processOperatorRef].push(usage);
        if (!trUsages[usage.technicalResourceRef]) {
            trUsages[usage.technicalResourceRef] = [];
        }
        trUsages[usage.technicalResourceRef].push(usage);
    }

    const lines: string[] = [];

    // --- XML declaration ---
    lines.push(`<?xml version='1.0' encoding='UTF-8'?>`);

    // --- Root element ---
    lines.push(
        `<${fpbTag('project')} xmlns:${FPB_PREFIX}="${VDI3682_NAMESPACE}" xmlns:xsi="${XSI_NAMESPACE}">`,
    );

    // --- Project information ---
    lines.push(`  <${fpbTag('projectInformation')} entryPoint="process_1"/>`);

    // --- Process ---
    lines.push(`  <${fpbTag('process')} id="process_1">`);

    // --- SystemLimit (HSU: direct @id/@name) ---
    if (model.systemLimits.length > 0) {
        const sl = model.systemLimits[0];
        const slId = escapeXml(sl.identification.uniqueIdent);
        const slName = escapeXml(sl.label || model.title || 'System Boundary');
        lines.push(`    <${fpbTag('systemLimit')} id="${slId}" name="${slName}"/>`);
    } else {
        const slName = escapeXml(model.title || 'System Boundary');
        lines.push(`    <${fpbTag('systemLimit')} id="sl_1" name="${slName}"/>`);
    }

    // --- States ---
    lines.push(`    <${fpbTag('states')}>`);
    for (const state of model.states) {
        const stateType = STATE_TYPE_MAP[state.stateType] || 'product';
        lines.push(`      <${fpbTag('state')} stateType="${stateType}">`);
        lines.push(
            identificationXml(
                '        ',
                state.identification.uniqueIdent,
                state.label || null,
                state.identification.shortName,
            ),
        );
        lines.push(emptyChildrenXml('        ', 'characteristics', 'assignments'));
        lines.push(
            flowsElementXml(
                '        ',
                state.id,
                sourceFlows[state.id] || [],
                targetFlows[state.id] || [],
            ),
        );
        lines.push(`      </${fpbTag('state')}>`);
    }
    lines.push(`    </${fpbTag('states')}>`);

    // --- ProcessOperators ---
    lines.push(`    <${fpbTag('processOperators')}>`);
    for (const po of model.processOperators) {
        lines.push(`      <${fpbTag('processOperator')}>`);
        lines.push(
            identificationXml(
                '        ',
                po.identification.uniqueIdent,
                po.label || null,
                po.identification.shortName,
            ),
        );
        lines.push(emptyChildrenXml('        ', 'characteristics', 'assignments'));
        lines.push(
            flowsElementXml('        ', po.id, sourceFlows[po.id] || [], targetFlows[po.id] || []),
        );
        lines.push(usagesElementXml('        ', poUsages[po.id] || []));
        lines.push(`      </${fpbTag('processOperator')}>`);
    }
    lines.push(`    </${fpbTag('processOperators')}>`);

    // --- TechnicalResources ---
    lines.push(`    <${fpbTag('technicalResources')}>`);
    for (const tr of model.technicalResources) {
        lines.push(`      <${fpbTag('technicalResource')}>`);
        lines.push(
            identificationXml(
                '        ',
                tr.identification.uniqueIdent,
                tr.label || null,
                tr.identification.shortName,
            ),
        );
        lines.push(emptyChildrenXml('        ', 'characteristics', 'assignments'));
        lines.push(usagesElementXml('        ', trUsages[tr.id] || []));
        lines.push(`      </${fpbTag('technicalResource')}>`);
    }
    lines.push(`    </${fpbTag('technicalResources')}>`);

    // --- FlowContainer (registry only — no sourceRef/targetRef) ---
    lines.push(`    <${fpbTag('flowContainer')}>`);
    for (const flow of model.flows) {
        const flowType = FLOW_TYPE_MAP[flow.flowType] || 'flow';
        lines.push(`      <${fpbTag('flow')} id="${escapeXml(flow.id)}" flowType="${flowType}"/>`);
    }
    for (const usage of model.usages) {
        lines.push(`      <${fpbTag('flow')} id="${escapeXml(usage.id)}" flowType="usage"/>`);
    }
    lines.push(`    </${fpbTag('flowContainer')}>`);

    // --- Close process and root ---
    lines.push(`  </${fpbTag('process')}>`);
    lines.push(`</${fpbTag('project')}>`);
    lines.push('');

    return lines.join('\n');
}
