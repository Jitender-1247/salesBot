import { Link } from 'react-router-dom';

export default function BackButton({ to, label }) {
    return (
        <Link
            to={to}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 group no-underline mb-3 cursor-pointer"
            style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-light)',
                color: 'var(--text-sub)',
                boxShadow: 'var(--shadow-card)',
            }}
        >
            <span className="text-sm transition-transform duration-200 group-hover:-translate-x-1"
                style={{ color: 'var(--accent-primary)' }}>
                ←
            </span>
            <span className="transition-colors" style={{ color: 'var(--text-main)' }}>
                {label}
            </span>
        </Link>
    );
}
