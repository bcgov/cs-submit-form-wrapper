import express from 'express';
import { formRouter } from '../features/forms';
import { createJwtMiddleware } from '../middleware/auth';

<<<<<<< Updated upstream
export { formioRouter };
=======
const router = express.Router();

router.use('/form', createJwtMiddleware(), formRouter);
// Log and return a 404 for any unmatched API routes (helps debugging)
router.use('/*', (req, res) => {
  console.warn(`API route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Endpoint not found' });
});

export { router };
>>>>>>> Stashed changes
