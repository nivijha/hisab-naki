import type { AuthContext } from '../middleware/authenticate.js';
import type { AuthenticatedUser } from '../middleware/authenticateToken.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      authUser?: AuthenticatedUser;
    }
  }
}

export {};
