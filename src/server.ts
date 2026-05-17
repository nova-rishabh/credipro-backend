import './config/env';
import app from './app';
import { logger } from './lib/logger';
import { contractAddress } from './config/client';

const PORT = process.env.PORT || 3001;

import { getMode } from './lib/appMode';

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`[SERVER] Credipro backend running on port ${PORT}`);
    logger.info(`[SERVER] Mode: ${getMode()}`);
    logger.info(`[SERVER] Contract address: ${contractAddress}`);
  });
}

export default app;
