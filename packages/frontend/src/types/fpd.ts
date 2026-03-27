/** TypeScript type definitions matching backend VDI 3682 models. */

export enum StateType {
  PRODUCT = "product",
  ENERGY = "energy",
  INFORMATION = "information",
}

export enum FlowType {
  FLOW = "flow",
  ALTERNATIVE_FLOW = "alternativeFlow",
  PARALLEL_FLOW = "parallelFlow",
}

export interface Identification {
  uniqueIdent: string;
  longName: string | null;
}

export type StatePlacement =
  | "boundary"
  | "boundary-top"
  | "boundary-bottom"
  | "boundary-left"
  | "boundary-right"
  | "internal";

export interface State {
  id: string;
  stateType: StateType;
  identification: Identification;
  label: string;
  placement?: StatePlacement | null;
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

export interface ProcessModel {
  title: string;
  systemLimits: SystemLimit[];
  states: State[];
  processOperators: ProcessOperator[];
  technicalResources: TechnicalResource[];
  flows: Flow[];
  usages: Usage[];
  errors: string[];
  warnings: string[];
}
