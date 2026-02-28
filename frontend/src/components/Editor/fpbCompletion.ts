/** Monaco autocomplete provider for FPB keywords and snippets. */

import type * as monaco from 'monaco-editor';

export function createFpbCompletionProvider(
  monacoInstance: typeof monaco,
): monaco.languages.CompletionItemProvider {
  const { CompletionItemKind, CompletionItemInsertTextRule } =
    monacoInstance.languages;

  return {
    triggerCharacters: ['@', '-', '=', '<', '.'],

    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Check if cursor is at a line beginning (for block / element suggestions)
      const lineContent = model.getLineContent(position.lineNumber);
      const textBefore = lineContent.substring(0, position.column - 1).trim();

      const suggestions: monaco.languages.CompletionItem[] = [];

      // Block delimiters
      if (textBefore === '' || textBefore === '@') {
        suggestions.push(
          {
            label: '@startfpb',
            kind: CompletionItemKind.Keyword,
            insertText: '@startfpb',
            range,
            detail: 'Begin FPB document',
          },
          {
            label: '@endfpb',
            kind: CompletionItemKind.Keyword,
            insertText: '@endfpb',
            range,
            detail: 'End FPB document',
          },
        );
      }

      // Placement annotations (after a string label or @)
      if (textBefore === '@' || /"\s*@?$/.test(textBefore)) {
        suggestions.push(
          {
            label: '@boundary',
            kind: CompletionItemKind.Keyword,
            insertText: '@boundary',
            range,
            detail: 'Place state on system limit boundary (auto-detect side)',
          },
          {
            label: '@boundary-top',
            kind: CompletionItemKind.Keyword,
            insertText: '@boundary-top',
            range,
            detail: 'Place state on top edge of system limit',
          },
          {
            label: '@boundary-bottom',
            kind: CompletionItemKind.Keyword,
            insertText: '@boundary-bottom',
            range,
            detail: 'Place state on bottom edge of system limit',
          },
          {
            label: '@boundary-left',
            kind: CompletionItemKind.Keyword,
            insertText: '@boundary-left',
            range,
            detail: 'Place state on left edge of system limit',
          },
          {
            label: '@boundary-right',
            kind: CompletionItemKind.Keyword,
            insertText: '@boundary-right',
            range,
            detail: 'Place state on right edge of system limit',
          },
          {
            label: '@internal',
            kind: CompletionItemKind.Keyword,
            insertText: '@internal',
            range,
            detail: 'Place state fully inside system limit',
          },
        );
      }

      // Element keywords
      suggestions.push(
        {
          label: 'product',
          kind: CompletionItemKind.Keyword,
          insertText: 'product ${1:Id} "${2:Label}"',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'Declare a Product state',
        },
        {
          label: 'energy',
          kind: CompletionItemKind.Keyword,
          insertText: 'energy ${1:Id} "${2:Label}"',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'Declare an Energy state',
        },
        {
          label: 'information',
          kind: CompletionItemKind.Keyword,
          insertText: 'information ${1:Id} "${2:Label}"',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'Declare an Information state',
        },
        {
          label: 'process_operator',
          kind: CompletionItemKind.Keyword,
          insertText: 'process_operator ${1:Id} "${2:Label}"',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'Declare a Process Operator',
        },
        {
          label: 'technical_resource',
          kind: CompletionItemKind.Keyword,
          insertText: 'technical_resource ${1:Id} "${2:Label}"',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'Declare a Technical Resource',
        },
        {
          label: 'title',
          kind: CompletionItemKind.Keyword,
          insertText: 'title "${1:Process Name}"',
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'Set process title',
        },
      );

      // Connection operators (only if text before looks like an identifier)
      if (/[a-zA-Z_]\w*\s*$/.test(textBefore)) {
        suggestions.push(
          {
            label: '-->',
            kind: CompletionItemKind.Operator,
            insertText: '--> ',
            range,
            detail: 'Flow connection',
          },
          {
            label: '-.->',
            kind: CompletionItemKind.Operator,
            insertText: '-.-> ',
            range,
            detail: 'Alternative flow connection',
          },
          {
            label: '==>',
            kind: CompletionItemKind.Operator,
            insertText: '==> ',
            range,
            detail: 'Parallel flow connection',
          },
          {
            label: '<..>',
            kind: CompletionItemKind.Operator,
            insertText: '<..> ',
            range,
            detail: 'Usage connection',
          },
        );
      }

      // Snippet: full template
      suggestions.push({
        label: 'fpb-template',
        kind: CompletionItemKind.Snippet,
        insertText: [
          '@startfpb',
          'title "${1:Process Name}"',
          '',
          '// States',
          'product ${2:P1} "${3:Input}"',
          'product ${4:P2} "${5:Output}"',
          '',
          '// Process Operators',
          'process_operator ${6:PO1} "${7:Processing}"',
          '',
          '// Connections',
          '${2:P1} --> ${6:PO1}',
          '${6:PO1} --> ${4:P2}',
          '',
          '@endfpb',
        ].join('\n'),
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range,
        detail: 'Full FPB document template',
      });

      return { suggestions };
    },
  };
}
