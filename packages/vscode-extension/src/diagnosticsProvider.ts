import * as vscode from 'vscode';

/**
 * Diagnostics provider for FPD language
 * Provides real-time syntax and validation error detection
 */
export class FpdDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('fpd');
    }

    /**
     * Validate a document and update diagnostics
     */
    public validateDocument(document: vscode.TextDocument): void {
        if (document.languageId !== 'fpd') {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        const declaredElements = new Map<string, { type: string; line: number; systemId: string | null }>();

        let inFpdBlock = false;
        let hasStartFpd = false;
        let systemDepth = 0;
        let currentSystemId: string | null = null;
        const systemStack: (string | null)[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i;

            // Skip empty lines and comments
            if (!line || line.startsWith('//')) {
                continue;
            }

            // Check for @startfpd and @endfpd
            if (line === '@startfpd') {
                if (inFpdBlock) {
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        0,
                        line.length,
                        'Nested @startfpd blocks are not allowed',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
                inFpdBlock = true;
                hasStartFpd = true;
                continue;
            }

            if (line === '@endfpd') {
                if (!inFpdBlock) {
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        0,
                        line.length,
                        '@endfpd without matching @startfpd',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
                inFpdBlock = false;
                continue;
            }

            // Content outside FPD block
            if (!inFpdBlock && hasStartFpd) {
                diagnostics.push(this.createDiagnostic(
                    lineNumber,
                    0,
                    line.length,
                    'Content outside @startfpd...@endfpd block',
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // System block opening: system "Name" {
            const systemMatch = line.match(/^system\s+"([^"]*)"\s*\{$/);
            if (systemMatch) {
                systemStack.push(currentSystemId);
                currentSystemId = systemMatch[1] || `system_${systemDepth}`;
                systemDepth++;
                continue;
            }

            // Closing brace for system block
            if (line === '}') {
                if (systemDepth > 0) {
                    systemDepth--;
                    currentSystemId = systemStack.pop() ?? null;
                } else {
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        0,
                        1,
                        'Unexpected closing brace without matching system block',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
                continue;
            }

            // Validate element declarations (with optional label and optional annotation)
            // Matches: product P1 "Label" @boundary  OR  product P1 "Label"  OR  product P1
            const elementMatch = line.match(
                /^(product|energy|information|process_operator|technical_resource)\s+(\w+)(?:\s+"([^"]*)")?(?:\s+(@boundary|@internal))?$/
            );
            if (elementMatch) {
                const [, elementType, elementId, , annotation] = elementMatch;

                if (declaredElements.has(elementId)) {
                    const prevDecl = declaredElements.get(elementId)!;
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        line.indexOf(elementId),
                        elementId.length,
                        `Element '${elementId}' already declared on line ${prevDecl.line + 1}`,
                        vscode.DiagnosticSeverity.Error
                    ));
                } else {
                    declaredElements.set(elementId, { type: elementType, line: lineNumber, systemId: currentSystemId });
                }

                // Warn if annotation used on non-state elements
                if (annotation && !['product', 'energy', 'information'].includes(elementType)) {
                    const annotIdx = line.indexOf(annotation);
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        annotIdx,
                        annotation.length,
                        `Placement annotation '${annotation}' is only valid on state elements (product, energy, information)`,
                        vscode.DiagnosticSeverity.Warning
                    ));
                }

                continue;
            }

            // Validate title declarations
            const titleMatch = line.match(/^title\s+"([^"]*)"$/);
            if (titleMatch) {
                const [, title] = titleMatch;
                if (!title) {
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        line.indexOf('""'),
                        2,
                        'Title cannot be empty',
                        vscode.DiagnosticSeverity.Warning
                    ));
                }
                continue;
            }

            // Validate connections
            const connectionMatch = line.match(/^(\w+)\s+(-->|-\.->|==>|<\.\.>)\s+(\w+)$/);
            if (connectionMatch) {
                const [, sourceId, operator, targetId] = connectionMatch;

                // Check if elements are declared
                if (!declaredElements.has(sourceId)) {
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        line.indexOf(sourceId),
                        sourceId.length,
                        `Element '${sourceId}' is not declared`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }

                if (!declaredElements.has(targetId)) {
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        line.lastIndexOf(targetId),
                        targetId.length,
                        `Element '${targetId}' is not declared`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }

                // Validate connection rules
                if (declaredElements.has(sourceId) && declaredElements.has(targetId)) {
                    const sourceEl = declaredElements.get(sourceId)!;
                    const targetEl = declaredElements.get(targetId)!;

                    const isCrossSystem = systemDepth === 0
                        && sourceEl.systemId !== null
                        && targetEl.systemId !== null
                        && sourceEl.systemId !== targetEl.systemId;

                    const validationError = this.validateConnection(sourceEl.type, targetEl.type, operator, isCrossSystem);
                    if (validationError) {
                        diagnostics.push(this.createDiagnostic(
                            lineNumber,
                            line.indexOf(operator),
                            operator.length,
                            validationError,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                }
                continue;
            }

            // Check for malformed element declarations
            const malformedElementMatch = line.match(/^(product|energy|information|process_operator|technical_resource)\s+/);
            if (malformedElementMatch) {
                diagnostics.push(this.createDiagnostic(
                    lineNumber,
                    0,
                    line.length,
                    'Invalid element declaration syntax. Expected: <type> <ID> ["<Label>"] [@boundary|@internal]',
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // Check for malformed system blocks
            const malformedSystemMatch = line.match(/^system\s+/);
            if (malformedSystemMatch) {
                diagnostics.push(this.createDiagnostic(
                    lineNumber,
                    0,
                    line.length,
                    'Invalid system syntax. Expected: system "<Name>" {',
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // Check for malformed title declarations
            const malformedTitleMatch = line.match(/^title\s+/);
            if (malformedTitleMatch) {
                diagnostics.push(this.createDiagnostic(
                    lineNumber,
                    0,
                    line.length,
                    'Invalid title syntax. Expected: title "<Title Text>"',
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // Check for malformed connections
            const malformedConnectionMatch = line.match(/^(\w+)\s+(-->|-\.->|==>|<\.\.>)\s*/);
            if (malformedConnectionMatch) {
                diagnostics.push(this.createDiagnostic(
                    lineNumber,
                    0,
                    line.length,
                    'Invalid connection syntax. Expected: <source_id> <operator> <target_id>',
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // Unknown syntax
            if (inFpdBlock && line !== '@startfpd' && line !== '@endfpd') {
                diagnostics.push(this.createDiagnostic(
                    lineNumber,
                    0,
                    line.length,
                    'Unrecognized syntax',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        // Check for missing @endfpd
        if (inFpdBlock) {
            const lastLine = lines.length - 1;
            diagnostics.push(this.createDiagnostic(
                lastLine,
                0,
                lines[lastLine].length,
                'Missing @endfpd to close the FPD block',
                vscode.DiagnosticSeverity.Error
            ));
        }

        // Check for unclosed system blocks
        if (systemDepth > 0) {
            const lastLine = lines.length - 1;
            diagnostics.push(this.createDiagnostic(
                lastLine,
                0,
                lines[lastLine].length,
                `${systemDepth} unclosed system block(s)`,
                vscode.DiagnosticSeverity.Error
            ));
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    /**
     * Validate connection rules between element types
     * Returns error message if invalid, null if valid
     */
    private validateConnection(sourceType: string, targetType: string, operator: string, isCrossSystem: boolean = false): string | null {
        const flowTypes = new Set(['product', 'energy', 'information']);

        // Flow operators (-->, -.->, ==>) have specific rules
        if (operator === '-->' || operator === '-.->' || operator === '==>') {
            // State -> State: allowed only as cross-system connection
            if (flowTypes.has(sourceType) && flowTypes.has(targetType)) {
                if (isCrossSystem) {
                    return null; // Valid cross-system connection
                }
                return `Cannot connect ${sourceType} directly to ${targetType}. Flow connections require a process_operator (or use outside system blocks for cross-system flows).`;
            }

            // Technical resources cannot use flow operators (should use <..>)
            if (sourceType === 'technical_resource' || targetType === 'technical_resource') {
                return `Technical resources cannot use flow connections (${operator}). Use <..> instead.`;
            }
        }

        // Usage connection (<..>) connects process_operator <-> technical_resource
        if (operator === '<..>') {
            const validPair =
                (sourceType === 'process_operator' && targetType === 'technical_resource') ||
                (sourceType === 'technical_resource' && targetType === 'process_operator');
            if (!validPair) {
                return `Usage connection (<..>) must connect process_operator and technical_resource.`;
            }
        }

        return null;
    }

    /**
     * Create a diagnostic object
     */
    private createDiagnostic(
        line: number,
        startChar: number,
        length: number,
        message: string,
        severity: vscode.DiagnosticSeverity
    ): vscode.Diagnostic {
        const range = new vscode.Range(
            new vscode.Position(line, startChar),
            new vscode.Position(line, startChar + length)
        );
        return new vscode.Diagnostic(range, message, severity);
    }

    /**
     * Clear diagnostics for a document
     */
    public clearDiagnostics(document: vscode.TextDocument): void {
        this.diagnosticCollection.delete(document.uri);
    }

    /**
     * Dispose of the diagnostic collection
     */
    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
}

/**
 * Register the FPD diagnostics provider
 */
export function registerDiagnosticsProvider(context: vscode.ExtensionContext): FpdDiagnosticsProvider {
    const provider = new FpdDiagnosticsProvider();

    // Validate active editor on activation
    if (vscode.window.activeTextEditor) {
        provider.validateDocument(vscode.window.activeTextEditor.document);
    }

    // Validate on document open
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(document => {
            provider.validateDocument(document);
        })
    );

    // Validate on document change (with debouncing)
    let validationTimeout: NodeJS.Timeout | undefined;
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (validationTimeout) {
                clearTimeout(validationTimeout);
            }
            validationTimeout = setTimeout(() => {
                provider.validateDocument(event.document);
            }, 300); // 300ms debounce
        })
    );

    // Clear diagnostics when document is closed
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument(document => {
            provider.clearDiagnostics(document);
        })
    );

    // Validate on editor change
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                provider.validateDocument(editor.document);
            }
        })
    );

    // Register for disposal
    context.subscriptions.push(provider);

    return provider;
}
