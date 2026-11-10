const SCORES = {
    hot: { label: '🔥 Hot', className: 'status-pill-red' },
    warm: { label: '☀️ Warm', className: 'status-pill-yellow' },
    cold: { label: '❄️ Cold', className: 'status-pill-purple' }
};

/** Hot / Warm / Cold buying temperature graded at the end of a call. */
export default function LeadScorePill({ score, reason }) {
    const s = SCORES[score];
    if (!s) return null;
    return <span className={`status-pill ${s.className}`} title={reason || ''}>{s.label}</span>;
}
