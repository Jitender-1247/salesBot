// Shown instead of an empty state when a fetch actually failed — so "No data yet"
// never masks a dead backend.
export default function ErrorCard({ message, onRetry }) {
    return (
        <div className="ultra-card p-12 text-center">
            <p className="text-3xl mb-3">⚠️</p>
            <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-main)' }}>Something went wrong</h3>
            <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
                {message || "Couldn't reach the server. Check your connection and try again."}
            </p>
            {onRetry && (
                <button type="button" onClick={onRetry} className="ultra-btn-primary text-xs">
                    Try again
                </button>
            )}
        </div>
    );
}
