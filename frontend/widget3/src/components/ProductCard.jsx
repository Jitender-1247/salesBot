function formatPrice(price, currency) {
    if (price === null || price === undefined) return '';
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(price);
    } catch {
        return `${currency || ''} ${price}`.trim();
    }
}

/** Catalog item the agent recommended during the call. */
export default function ProductCard({ product, agentName, onDismiss, onOpen, onAsk }) {
    if (!product) return null;
    const price = formatPrice(product.price, product.currency);

    return (
        <div className="knowledge-card-wrapper animate-slide-up">
            <div className="knowledge-card product-card">
                <div className="card-top-bar">
                    <span className="card-badge">🛍️ Recommended by {agentName}</span>
                    <button className="card-close-btn" onClick={onDismiss} title="Dismiss">
                        ✕
                    </button>
                </div>

                <div className="product-card-body">
                    {product.image && (
                        <div className="product-card-image">
                            <img src={product.image} alt={product.name} />
                        </div>
                    )}
                    <div className="card-content">
                        <h3 className="card-title">{product.name}</h3>
                        {price && <div className="product-card-price">{price}</div>}
                        {product.description && (
                            <p className="card-desc">{product.description}</p>
                        )}
                    </div>
                </div>

                <div className="card-actions">
                    {product.url && (
                        <a
                            href={product.url}
                            target="_blank"
                            rel="noreferrer"
                            className="card-cta-btn primary"
                            onClick={() => onOpen?.(product)}
                        >
                            <span>{product.ctaLabel || 'View product'}</span>
                            <span className="arrow">→</span>
                        </a>
                    )}
                    <button
                        type="button"
                        className="card-cta-btn secondary"
                        onClick={() => onAsk?.(product)}
                    >
                        Ask about this
                    </button>
                </div>
            </div>
        </div>
    );
}
