import React from 'react';

export default function KnowledgeCard({ card, onDismiss, onAction }) {
    if (!card) return null;

    return (
        <div className="knowledge-card-wrapper animate-slide-up">
            <div className="knowledge-card">
                <div className="card-top-bar">
                    <span className="card-badge">✨ {card.badge || 'Product Feature'}</span>
                    <button className="card-close-btn" onClick={onDismiss} title="Dismiss Card">
                        ✕
                    </button>
                </div>

                {card.screenshot && (
                    <div className="card-image-box">
                        <img src={card.screenshot} alt={card.name} />
                    </div>
                )}

                <div className="card-content">
                    <h3 className="card-title">{card.name}</h3>
                    {card.description && (
                        <p className="card-desc">{card.description}</p>
                    )}

                    {card.keyFeatures && card.keyFeatures.length > 0 && (
                        <ul className="card-features-list">
                            {card.keyFeatures.slice(0, 3).map((f, i) => (
                                <li key={i}>
                                    <span className="bullet-check">✓</span> {f}
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="card-actions">
                        {card.url && (
                            <a
                                href={card.url}
                                target="_blank"
                                rel="noreferrer"
                                className="card-cta-btn primary"
                                onClick={() => onAction?.(card)}
                            >
                                <span>Explore Page</span>
                                <span className="arrow">→</span>
                            </a>
                        )}
                        <button
                            type="button"
                            className="card-cta-btn secondary"
                            onClick={() => onAction?.({ ...card, askMore: true })}
                        >
                            Ask Sofia About This
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
