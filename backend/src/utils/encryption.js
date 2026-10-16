import crypto from 'crypto';

// New values use AES-256-GCM (authenticated: tampering is detected).
// Format: "v2:<iv hex>:<auth tag hex>:<ciphertext hex>"
// Legacy values ("<iv hex>:<ciphertext hex>", AES-256-CBC) are still decrypted so existing
// stored credentials keep working. They are upgraded the next time they are saved.

const GCM = 'aes-256-gcm';
const LEGACY_CBC = 'aes-256-cbc';

const getKey = () => {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error('ENCRYPTION_KEY is not defined in .env');
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
        throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    return Buffer.from(key, 'hex');
};

export const assertEncryptionKey = () => { getKey(); };

export const encrypt = (text) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(GCM, getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
};

export const decrypt = (encryptedText) => {
    if (encryptedText.startsWith('v2:')) {
        const [, ivHex, tagHex, dataHex] = encryptedText.split(':');
        const decipher = crypto.createDecipheriv(GCM, getKey(), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    }
    const [ivHex, encrypted] = encryptedText.split(':');
    const decipher = crypto.createDecipheriv(LEGACY_CBC, getKey(), Buffer.from(ivHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

/**
 * For fields that were historically stored in plain text (e.g. sessionCookies):
 * decrypt if the value is in our encrypted format, otherwise return it unchanged.
 */
export const decryptIfEncrypted = (value) => {
    if (!value) return value;
    if (/^v2:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/.test(value) || /^[0-9a-f]{32}:[0-9a-f]+$/.test(value)) {
        try { return decrypt(value); } catch { return value; }
    }
    return value;
};
