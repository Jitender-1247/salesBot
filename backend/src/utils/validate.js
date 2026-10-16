import mongoose from 'mongoose';

export const isObjectId = (v) => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v) && mongoose.isValidObjectId(v);

/** Optional string field: returns trimmed string, '' when absent, or null when invalid/too long. */
export const optionalString = (v, max) => {
    if (v === undefined || v === null || v === '') return '';
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s.length > max ? null : s;
};

/** Router param guard: 404 for malformed ids instead of a Mongoose CastError (500). */
export const objectIdParam = (req, res, next, value) => {
    if (!isObjectId(value)) return res.status(404).json({ message: 'Not found' });
    next();
};
