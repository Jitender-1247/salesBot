import jwt from 'jsonwebtoken';
import { isObjectId } from './validate.js';

export const JWT_ALGORITHM = 'HS256';

export const protect = (req, res, next) => {
    try {
        const [scheme, token] = (req.headers.authorization || '').split(' ');

        if (scheme !== 'Bearer' || !token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
        if (!isObjectId(decoded?.clientId)) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        req.clientId = decoded.clientId;
        next();

    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};
