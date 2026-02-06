//serve up DEFAULT form service on /form
import express from 'express';
import formioRouter from './formio.js';

const router = express.Router();

router.use('/', formioRouter);
router.use('/formio', formioRouter);

export {
  router as formRouter,
  formioRouter
}