import { Router, Request, Response } from 'express';
import { getMode, setMode, getMissingEnvVars, AppMode } from '../lib/appMode';
import { logger } from '../lib/logger';

export function createModeRouter(): Router {
  const router = Router();

  router.get('/mode', (_req: Request, res: Response) => {
    res.json({
      mode: getMode(),
      missingEnvVars: getMissingEnvVars(),
    });
  });

  router.put('/mode', (req: Request, res: Response) => {
    try {
      const { mode } = req.body;

      if (!mode || (mode !== 'demo' && mode !== 'production')) {
        res.status(400).json({ error: 'Invalid mode. Must be "demo" or "production".' });
        return;
      }

      const result = setMode(mode as AppMode);

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      logger.info(`[MODE] Mode switched to ${mode}`);
      res.json({ mode: getMode(), success: true });
    } catch (error) {
      logger.error('[MODE] Error switching mode:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  return router;
}
