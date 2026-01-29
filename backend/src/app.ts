import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { authenticate } from './middleware/auth.js';
import { formioRouter } from './routes';
import cors from 'cors';

const app = express();
const port = 4000;

if (process.env.NODE_ENV === 'development') {
  console.log('Allowing CORS for development environment');
  app.use(cors());
} else {
  console.log('Blocking CORS for production environment');
}

app.use(
  session({
    secret: process.env.SESSION_SECRET,
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.get('/api/docs', (_, res) => {
  res.send('FormIO Wrapper API Documentation');
});

app.get('/api/health', (_, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.use('/api/formio', authenticate, formioRouter);

app.use('/api/*', (_, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(port, () => {
  return console.log(`Express is listening at http://localhost:${port}`);
});
