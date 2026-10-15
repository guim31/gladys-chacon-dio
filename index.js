// -----------------------------------------------------------------------------
// Entry point of the Chacon DiO integration for Gladys Assistant.
//
// Role of this file: build the pieces and wire them. The DiO cloud protocol
// is in src/dio/, the Gladys side in src/app.js.
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { GladysIntegration, createLogger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { DioClient } from './src/dio/client.js';
import { createSessionStore } from './src/dio/session-store.js';

const logger = createLogger({ name: 'chacon-dio' });

// /data is the only writable volume of the container (read-only rootfs).
const store = createSessionStore({
  dir: process.env.DIO_DATA_DIR || '/data',
  logger: logger.child('session'),
});
const client = new DioClient({ store, logger: logger.child('cloud') });
const gladys = new GladysIntegration();
const app = createApp({ gladys, client, logger });

app.register();

// The SDK disconnects cleanly and exits with code 0 when the supervisor stops
// the container (SIGTERM/SIGINT). The DiO session stays valid for the next
// start: no logout here.
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  app.stop();
});

logger.info('Starting the Chacon DiO integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
