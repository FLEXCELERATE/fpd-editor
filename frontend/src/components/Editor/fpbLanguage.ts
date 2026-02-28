/** Monarch tokenizer definition for the FPB text syntax. */

import type * as monaco from 'monaco-editor';

export const FPB_LANGUAGE_ID = 'fpb';

export const fpbLanguageDefinition: monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.fpb',

  keywords: [
    'product',
    'energy',
    'information',
    'process_operator',
    'technical_resource',
    'title',
    'system',
  ],

  controlKeywords: ['startfpb', 'endfpb'],

  tokenizer: {
    root: [
      // Block delimiters
      [/@(startfpb|endfpb)/, 'keyword.control'],

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

export const fpbLanguageConfiguration: monaco.languages.LanguageConfiguration = {
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
