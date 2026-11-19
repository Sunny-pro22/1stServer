import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
const SECRET = process.env.JWT_SECRET || 'dev-secret';

export interface AuthRequest extends Request {
  user?: { id: string; role: 'ADMIN' | 'EMPLOYEE'; email: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(h.slice(7), SECRET) as any;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
  next();
}

export const signToken = (payload: any) => jwt.sign(payload, SECRET, { expiresIn: '7d' });