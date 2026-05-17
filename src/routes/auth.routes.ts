import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

export function createAuthRouter(jwtSecret: string): Router {
  const router = Router();

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many authentication attempts, please try again later' },
  });

  router.post('/auth/token', authLimiter, (req: Request, res: Response) => {
    const { username } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      res.status(400).json({ error: 'Missing or invalid username' });
      return;
    }

    const token = jwt.sign({ username: username.trim(), role: 'borrower' }, jwtSecret, {
      expiresIn: '24h',
    });
    res.json({ token });
  });

  return router;
}
