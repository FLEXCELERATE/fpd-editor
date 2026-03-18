/** Data models for VDI 3682 Formalized Process Description elements. */

export type StateType = 'product' | 'energy' | 'information';

export type StatePlacement =
    | 'boundary'
    | 'boundary-top'
    | 'boundary-bottom'
    | 'boundary-left'
    | 'boundary-right'
    | 'internal';

export type FlowType = 'flow' | 'alternativeFlow' | 'parallelFlow';

export interface Identification {
    uniqueIdent: string;
    longName?: string;
    shortName?: string;
}

export interface State {
    id: string;
    stateType: StateType;
    identification: Identification;
    label: string;
    placement?: StatePlacement;
    lineNumber?: number;
    systemId?: string;
}

export interface ProcessOperator {
    id: string;
    identification: Identification;
    label: string;
    lineNumber?: number;
    systemId?: string;
}

export interface TechnicalResource {
    id: string;
    identification: Identification;
    label: string;
    lineNumber?: number;
    systemId?: string;
}

export interface Flow {
    id: string;
    sourceRef: string;
    targetRef: string;
    flowType: FlowType;
    lineNumber?: number;
    systemId?: string;
}

export interface Usage {
    id: string;
    processOperatorRef: string;
    technicalResourceRef: string;
    lineNumber?: number;
    systemId?: string;
}

export interface SystemLimit {
    id: string;
    identification: Identification;
    label: string;
    lineNumber?: number;
}
