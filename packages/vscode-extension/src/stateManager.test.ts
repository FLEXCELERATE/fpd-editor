import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock vscode module before any imports that use it
vi.mock('vscode', () => ({}));

// Mock @fpd-editor/core
const mockRenderSvg = vi.fn();
const mockParse = vi.fn();
const mockRenderSvgFromDiagram = vi.fn();

vi.mock('@fpd-editor/core', () => ({
    FpdService: class MockFpdService {
        renderSvg = mockRenderSvg;
        parse = mockParse;
    },
    renderSvg: (diagram: unknown) => mockRenderSvgFromDiagram(diagram),
}));

import { StateManager } from './stateManager';

/** Configure parse() + renderSvg() mocks for a successful (possibly partial) render. */
function mockParseResult(svg: string, errors: string[] = [], warnings: string[] = []): void {
    mockParse.mockReturnValue({
        model: { errors, warnings },
        diagram: { marker: 'diagram' },
    });
    mockRenderSvgFromDiagram.mockReturnValue(svg);
}

function createMockOutputChannel() {
    return {
        appendLine: vi.fn(),
    } as unknown as import('vscode').OutputChannel;
}

describe('StateManager', () => {
    let manager: StateManager;
    let outputChannel: import('vscode').OutputChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        outputChannel = createMockOutputChannel();
        manager = new StateManager(outputChannel);
    });

    describe('loadFromText', () => {
        it('should populate svg and clear errors on valid FPD text', async () => {
            mockParseResult('<svg>test</svg>');

            await manager.loadFromText('process_operator P1 "Test"');

            const snapshot = manager.getSnapshot();
            expect(snapshot.svg).toBe('<svg>test</svg>');
            expect(snapshot.errors).toEqual([]);
            expect(snapshot.warnings).toEqual([]);
        });

        it('should set empty svg on empty string input', async () => {
            await manager.loadFromText('');

            const snapshot = manager.getSnapshot();
            expect(snapshot.svg).toBe('');
            expect(snapshot.errors).toEqual([]);
        });

        it('should set empty svg on whitespace-only input', async () => {
            await manager.loadFromText('   \n  \t  ');

            const snapshot = manager.getSnapshot();
            expect(snapshot.svg).toBe('');
            expect(snapshot.errors).toEqual([]);
        });

        it('should surface parse errors from the model while still rendering the diagram', async () => {
            mockParseResult('<svg>partial</svg>', ['Line 2: unexpected token']);

            await manager.loadFromText('invalid fpd content');

            const snapshot = manager.getSnapshot();
            expect(snapshot.svg).toBe('<svg>partial</svg>');
            expect(snapshot.errors).toEqual(['Line 2: unexpected token']);
        });

        it('should surface validation warnings from the model', async () => {
            mockParseResult('<svg/>', [], ['Flow references unknown element "x"']);

            await manager.loadFromText('some fpd');

            expect(manager.getSnapshot().warnings).toEqual(['Flow references unknown element "x"']);
        });

        it('should populate errors when rendering unexpectedly throws', async () => {
            mockParse.mockReturnValue({ model: { errors: [], warnings: [] }, diagram: {} });
            mockRenderSvgFromDiagram.mockImplementation(() => {
                throw new Error('Render failed');
            });

            await manager.loadFromText('input');

            const snapshot = manager.getSnapshot();
            expect(snapshot.errors).toEqual(['Render failed']);
            expect(snapshot.svg).toBe('');
        });

        it('should handle non-Error thrown values', async () => {
            mockParse.mockImplementation(() => {
                throw 'string error';
            });

            await manager.loadFromText('input');

            expect(manager.getSnapshot().errors).toEqual(['string error']);
        });

        it('should log parse errors to the output channel', async () => {
            mockParseResult('<svg/>', ['Line 1: bad']);

            await manager.loadFromText('bad input');

            expect(outputChannel.appendLine).toHaveBeenCalledWith('Parse errors:\n  Line 1: bad');
        });

        it('should log render errors to the output channel', async () => {
            mockParse.mockImplementation(() => {
                throw new Error('Render failed');
            });

            await manager.loadFromText('bad input');

            expect(outputChannel.appendLine).toHaveBeenCalledWith('Render error: Render failed');
        });
    });

    describe('version', () => {
        it('should start at version 0', () => {
            expect(manager.getSnapshot().version).toBe(0);
        });

        it('should increment version on each loadFromText call', async () => {
            mockParseResult('<svg></svg>');

            await manager.loadFromText('first');
            expect(manager.getSnapshot().version).toBe(1);

            await manager.loadFromText('second');
            expect(manager.getSnapshot().version).toBe(2);

            await manager.loadFromText('third');
            expect(manager.getSnapshot().version).toBe(3);
        });

        it('should increment version even on empty input', async () => {
            await manager.loadFromText('');
            expect(manager.getSnapshot().version).toBe(1);
        });

        it('should increment version even on error', async () => {
            mockParseResult('<svg/>', ['fail']);

            await manager.loadFromText('bad');
            expect(manager.getSnapshot().version).toBe(1);
        });
    });

    describe('onStateChanged', () => {
        it('should call listener after loadFromText with valid input', async () => {
            mockParseResult('<svg>ok</svg>');
            const listener = vi.fn();

            manager.onStateChanged(listener);
            await manager.loadFromText('valid fpd');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    svg: '<svg>ok</svg>',
                    errors: [],
                    version: 1,
                }),
            );
        });

        it('should call listener after loadFromText with empty input', async () => {
            const listener = vi.fn();

            manager.onStateChanged(listener);
            await manager.loadFromText('');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    svg: '',
                    errors: [],
                    version: 1,
                }),
            );
        });

        it('should call listener with model errors', async () => {
            mockParseResult('<svg/>', ['oops']);
            const listener = vi.fn();

            manager.onStateChanged(listener);
            await manager.loadFromText('bad');

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith(
                expect.objectContaining({
                    errors: ['oops'],
                    version: 1,
                }),
            );
        });

        it('should support multiple listeners', async () => {
            mockParseResult('<svg></svg>');
            const listener1 = vi.fn();
            const listener2 = vi.fn();

            manager.onStateChanged(listener1);
            manager.onStateChanged(listener2);
            await manager.loadFromText('input');

            expect(listener1).toHaveBeenCalledTimes(1);
            expect(listener2).toHaveBeenCalledTimes(1);
        });

        it('should unsubscribe when dispose function is called', async () => {
            mockParseResult('<svg></svg>');
            const listener = vi.fn();

            const unsubscribe = manager.onStateChanged(listener);
            await manager.loadFromText('first');
            expect(listener).toHaveBeenCalledTimes(1);

            unsubscribe();
            await manager.loadFromText('second');
            expect(listener).toHaveBeenCalledTimes(1); // still 1, not called again
        });
    });

    describe('getSnapshot', () => {
        it('should return a copy of errors array (not a reference)', async () => {
            mockParseResult('<svg/>', ['err']);

            await manager.loadFromText('bad');
            const snapshot1 = manager.getSnapshot();
            const snapshot2 = manager.getSnapshot();

            expect(snapshot1.errors).toEqual(snapshot2.errors);
            expect(snapshot1.errors).not.toBe(snapshot2.errors);
        });
    });

    describe('getService', () => {
        it('should return an FpdService instance', () => {
            const service = manager.getService();
            expect(service).toBeDefined();
            expect(typeof service.renderSvg).toBe('function');
        });
    });

    describe('concurrent loadFromText', () => {
        it('should increment version for each concurrent call', async () => {
            mockParseResult('<svg>a</svg>');

            // Fire multiple calls without awaiting
            const p1 = manager.loadFromText('first');
            const p2 = manager.loadFromText('second');
            const p3 = manager.loadFromText('third');
            await Promise.all([p1, p2, p3]);

            // Each call increments version, so final version should be 3
            expect(manager.getSnapshot().version).toBe(3);
        });

        it('should reflect the last completed call in the snapshot', async () => {
            mockParse.mockReturnValue({ model: { errors: [], warnings: [] }, diagram: {} });
            mockRenderSvgFromDiagram
                .mockReturnValueOnce('<svg>first</svg>')
                .mockReturnValueOnce('<svg>second</svg>');

            await manager.loadFromText('first');
            await manager.loadFromText('second');

            expect(manager.getSnapshot().svg).toBe('<svg>second</svg>');
            expect(manager.getSnapshot().version).toBe(2);
        });
    });

    describe('listener cleanup', () => {
        it('should not notify unsubscribed listeners even with multiple subscriptions', async () => {
            mockParseResult('<svg></svg>');
            const listener1 = vi.fn();
            const listener2 = vi.fn();
            const listener3 = vi.fn();

            const unsub1 = manager.onStateChanged(listener1);
            const unsub2 = manager.onStateChanged(listener2);
            manager.onStateChanged(listener3);

            // Unsubscribe first two
            unsub1();
            unsub2();

            await manager.loadFromText('input');

            expect(listener1).not.toHaveBeenCalled();
            expect(listener2).not.toHaveBeenCalled();
            expect(listener3).toHaveBeenCalledTimes(1);
        });

        it('should handle double-unsubscribe without error', async () => {
            const listener = vi.fn();
            const unsub = manager.onStateChanged(listener);

            unsub();
            // Second call should be harmless
            expect(() => unsub()).not.toThrow();
        });
    });
});
