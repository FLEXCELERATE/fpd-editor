/** @fpd-editor/core — shared FPD parsing, layout, rendering, and export engine. */

// Models
export type {
    StateType,
    StatePlacement,
    FlowType,
    Identification,
    State,
    ProcessOperator,
    TechnicalResource,
    Flow,
    Usage,
    SystemLimit,
} from './models/fpdModel';

export type { ProcessModel } from './models/processModel';
export { createProcessModel } from './models/processModel';

// Parser
export { TokenType } from './parser/syntax';
export type { Token } from './parser/lexer';
export { Lexer, LexerError } from './parser/lexer';
export { FpdParser, ParseError } from './parser/parser';
export { validateConnections } from './parser/validator';

// Layout
export type {
    LayoutConfig,
    LayoutElement,
    LayoutConnection,
    SystemLimitRect,
    DiagramLayout,
} from './services/layout';
export { createLayoutConfig, computeLayout } from './services/layout';

// Design tokens
export {
    COLORS,
    FONT_FAMILY,
    STROKE_WIDTH,
    STATE_LABEL_FONT_SIZE,
    PROCESS_LABEL_FONT_SIZE,
    SYSTEM_LIMIT_LABEL_FONT_SIZE,
} from './services/designTokens';

// Rendering
export { renderSvg } from './services/svgRenderer';

// Export
export { exportXml } from './export/xmlExporter';
export { exportText } from './export/textExporter';
export { exportPdf } from './export/pdfExporter';
export type { PageSizeOption, OrientationOption, PdfOptions } from './export/pdfExporter';

// Import
export { detectFormat, importXml } from './import/xmlImporter';

// Facade
export { FpdService } from './fpdService';
export type { ParseResult } from './fpdService';
