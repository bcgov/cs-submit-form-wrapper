import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

<<<<<<< Updated upstream
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { authenticate } from './middleware/auth.js';
import { formioRouter } from './routes';
=======
import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { router } from './routes/index.js'
>>>>>>> Stashed changes
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

// Mount API router at /api so routes like /api/form/test map correctly.
app.use('/api', router);

app.listen(port, () => {
  return console.log(`Express is listening at http://localhost:${port}`);
});
