import { useEffect, useState } from 'react';

interface ToastMessage {
    id: number;
    text: string;
    type: 'error' | 'success';
}

let toastId = 0;

const listeners = new Set<(msg: ToastMessage) => void>();

export function showToast(text: string, type: 'error' | 'success' = 'error') {
    const msg: ToastMessage = { id: ++toastId, text, type };
    listeners.forEach(fn => fn(msg));
}

export function ToastContainer() {
    const [messages, setMessages] = useState<ToastMessage[]>([]);

    useEffect(() => {
        const handler = (msg: ToastMessage) => {
            setMessages(prev => [...prev, msg]);
            setTimeout(() => {
                setMessages(prev => prev.filter(m => m.id !== msg.id));
            }, 5000);
        };
        listeners.add(handler);
        return () => { listeners.delete(handler); };
    }, []);

    if (messages.length === 0) return null;

    return (
        <div className="toast-container" role="alert" aria-live="polite">
            {messages.map(msg => (
                <div key={msg.id} className={`toast toast--${msg.type}`}>
                    <span className="toast__text">{msg.text}</span>
                    <button
                        className="toast__close"
                        onClick={() => setMessages(prev => prev.filter(m => m.id !== msg.id))}
                        aria-label="Dismiss"
                    >
                        &times;
                    </button>
                </div>
            ))}
        </div>
    );
}
