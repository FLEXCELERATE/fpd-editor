import * as vscode from 'vscode';

/**
 * Diagnostics provider for FPB language
 * Provides real-time syntax and validation error detection
 */
export class FpbDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('fpb');
    }

    /**
     * Validate a document and update diagnostics
     */
    public validateDocument(document: vscode.TextDocument): void {
        if (document.languageId !== 'fpb') {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
        const text = document.getText();
        const lines = text.split('\n');
        const declaredElements = new Map<string, { type: string; line: number }>();

        let inFpbBlock = false;
        let hasStartFpb = false;
        let systemDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i;

            // Skip empty lines and comments
            if (!line || line.startsWith('//')) {
                continue;
            }

            // Check for @startfpb and @endfpb
            if (line === '@startfpb') {
                if (inFpbBlock) {
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        0,
                        line.length,
                        'Nested @startfpb blocks are not allowed',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
                inFpbBlock = true;
                hasStartFpb = true;
                continue;
            }

            if (line === '@endfpb') {
                if (!inFpbBlock) {
                    diagnostics.push(this.createDiagnostic(
                        lineNumber,
                        0,
                        line.length,
                        '@endfpb without matching @startfpb',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
                inFpbBlock = false;
                continue;
            }

            // Content outside FPB block
            if (!inFpbBlock && hasStartFpb) {
                diagnostics.push(this.createDiagnostic(
                    lineNumber,
                    0,
                    line.length,
                    'Content outside @startfpb...@endfpb block',
                    vscode.DiagnosticSeverity.Error
                ));
                continue;
            }

            // System block opening: system "Name" {
            const systemMatch = line.match(/^system\s+"([^"]*)"\s*\{$/);
            if (systemMatch) {
                systemDepth++;
                continue;
            }

            // Closing brace for system block
            if (line === '}') {
                if (systemDepth > 0) {
                    systemDepth--;
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
                    declaredElements.set(elementId, { type: elementType, line: lineNumber });
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
                    const sourceType = declaredElements.get(sourceId)!.type;
                    const targetType = declaredElements.get(targetId)!.type;

                    const validationError = this.validateConnection(sourceType, targetType, operator);
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
            if (inFpbBlock && line !== '@startfpb' && line !== '@endfpb') {
                diagnostics.push(this.createDiagnostic(
                    lineNumber,
                    0,
                    line.length,
                    'Unrecognized syntax',
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        // Check for missing @endfpb
        if (inFpbBlock) {
            const lastLine = lines.length - 1;
            diagnostics.push(this.createDiagnostic(
                lastLine,
                0,
                lines[lastLine].length,
                'Missing @endfpb to close the FPB block',
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
    private validateConnection(sourceType: string, targetType: string, operator: string): string | null {
        // Flow operators (-->, -.->, ==>) have specific rules
        if (operator === '-->' || operator === '-.->') {
            // Products, energy, and information cannot connect directly to each other
            const flowTypes = new Set(['product', 'energy', 'information']);
            if (flowTypes.has(sourceType) && flowTypes.has(targetType)) {
                return `Cannot connect ${sourceType} directly to ${targetType}. Flow connections require a process_operator.`;
            }

            // Technical resources cannot use flow operators (should use <..>)
            if (sourceType === 'technical_resource' || targetType === 'technical_resource') {
                return `Technical resources cannot use flow connections (${operator}). Use <..> instead.`;
            }
        }

        // Parallel flow (==>) has same rules as regular flow
        if (operator === '==>') {
            const flowTypes = new Set(['product', 'energy', 'information']);
            if (flowTypes.has(sourceType) && flowTypes.has(targetType)) {
                return `Cannot connect ${sourceType} directly to ${targetType} using parallel flow.`;
            }

            if (sourceType === 'technical_resource' || targetType === 'technical_resource') {
                return `Technical resources cannot use parallel flow connections (${operator}). Use <..> instead.`;
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
 * Register the FPB diagnostics provider
 */
export function registerDiagnosticsProvider(context: vscode.ExtensionContext): FpbDiagnosticsProvider {
    const provider = new FpbDiagnosticsProvider();

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
