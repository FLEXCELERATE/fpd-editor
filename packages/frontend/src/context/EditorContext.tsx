import { createContext, useContext, ReactNode } from 'react';
import type { ProcessModel } from '../types/fpd';

interface EditorContextValue {
    source: string;
    model: ProcessModel | null;
    loading: boolean;
    error: string | null;
}

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
    value,
    children,
}: {
    value: EditorContextValue;
    children: ReactNode;
}) {
    return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditorContext(): EditorContextValue {
    const ctx = useContext(EditorContext);
    if (!ctx) throw new Error('useEditorContext must be used within EditorProvider');
    return ctx;
}
