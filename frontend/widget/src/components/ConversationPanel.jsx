import { useRef, useEffect } from 'react';

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ConversationPanel({ messages, isProcessing }) {
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isProcessing]);

    return (
        <div className="glass-card conversation-panel">
            <div className="card-header">
                <h2>💬 Conversation</h2>
                <p>Live transcript</p>
            </div>

            <div className="messages-container">
                {messages.length === 0 && !isProcessing && (
                    <div className="empty-state">
                        <div className="empty-state-icon">🎙️</div>
                        <h3>Start Speaking</h3>
                        <p>Just speak naturally — Alex is always listening and ready to help.</p>
                    </div>
                )}

                {messages.map((message) => (
                    <div key={message.id} className={`message ${message.role}`}>
                        <div className="message-bubble">
                            {message.content}
                        </div>
                        <div className="message-meta">
                            <span className="message-role">
                                {message.role === 'user' ? 'You' : 'Alex'}
                            </span>
                            <span>·</span>
                            <span>{formatTime(message.timestamp)}</span>
                        </div>
                    </div>
                ))}

                {isProcessing && (
                    <div className="processing-indicator">
                        <div className="typing-dots">
                            <span />
                            <span />
                            <span />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Alex is thinking…
                        </span>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
