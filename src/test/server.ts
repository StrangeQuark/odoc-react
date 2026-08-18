import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/** Shared deterministic API boundary for component and transport tests. */
export const server = setupServer(...handlers);
