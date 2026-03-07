/** Monarch tokenizer definition for the FPD text syntax. */

import type * as monaco from 'monaco-editor';

export const FPD_LANGUAGE_ID = 'fpd';

export const fpdLanguageDefinition: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.fpd',

  keywords: [
    'product',
    'energy',
    'information',
    'process_operator',
    'technical_resource',
    'title',
    'system',
  ],

  controlKeywords: ['startfpd', 'endfpd'],

  tokenizer: {
    root: [
      // Block delimiters
      [/@(startfpd|endfpd)/, 'keyword.control'],

      // Placement annotations (longer patterns first)
      [/@(boundary-top|boundary-bottom|boundary-left|boundary-right|boundary|internal)/, 'keyword.annotation'],

      // Line comments
      [/\/\/.*$/, 'comment'],

      // Strings
      [/"[^"]*"/, 'string'],

      // Braces
      [/[{}]/, 'delimiter.bracket'],

      // Connection operators (order matters: longer first)
      [/<\.\.>/, 'operator.connection'],
      [/-\.->/, 'operator.connection'],
      [/==>/, 'operator.connection'],
      [/-->/, 'operator.connection'],

      // Keywords and identifiers
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword.element',
            '@default': 'identifier',
          },
        },
      ],

      // Whitespace
      [/\s+/, 'white'],
    ],
  },
};

export const fpdLanguageConfiguration: monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
  },
  brackets: [['{', '}']],
  autoClosingPairs: [
    { open: '"', close: '"' },
    { open: '{', close: '}' },
  ],
  surroundingPairs: [
    { open: '"', close: '"' },
    { open: '{', close: '}' },
  ],
};
