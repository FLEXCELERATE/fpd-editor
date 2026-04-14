/**
 * Shared type maps for VDI 3682 element types.
 *
 * These maps are used across the parser, XML exporter, and XML importer
 * to consistently map between enum values and their string representations.
 */

import type { FlowType, StateType } from './fpdModel';

/** Maps StateType enum values to their XML string representation. */
export const STATE_TYPE_MAP: Record<string, StateType> = {
    product: 'product',
    energy: 'energy',
    information: 'information',
};

/** Maps FlowType enum values to their XML string representation. */
export const FLOW_TYPE_MAP: Record<string, FlowType> = {
    flow: 'flow',
    alternativeFlow: 'alternativeFlow',
    parallelFlow: 'parallelFlow',
};
