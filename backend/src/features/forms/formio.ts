import express from 'express';
const router = express.Router();
import axios from 'axios'
import rateLimit from 'express-rate-limit';

const FORMIO_URL = process.env.FORMIO_BASE_URL
const FORMIO_ADMIN_USER = process.env.FORMIO_ADMIN_USERNAME
const FORMIO_ADMIN_PASS = process.env.FORMIO_ADMIN_PASSWORD
const FORMIO_MANAGER_USER = process.env.FORMIO_MANAGER_USERNAME
const FORMIO_MANAGER_PASS = process.env.FORMIO_MANAGER_PASSWORD
import { User, ADMIN } from '../../types/user';
import { hasRole } from '../../middleware/auth';

type RequestWithUser = express.Request & { user?: User };

const formioLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const authToFormio = async (user: User) => {
  const body = {
    data: {
      email: '',
      password: ''
    }
  }
  if (user && hasRole(user, ADMIN)) {
    body.data.email = FORMIO_ADMIN_USER;
    body.data.password = FORMIO_ADMIN_PASS;
  } else if (user && hasRole(user, 'manager')) {
    body.data.email = FORMIO_MANAGER_USER;
    body.data.password = FORMIO_MANAGER_PASS;
  }
  
  // this is what the url is supposed to be but it's not working against the configured server
  // const resp = await axios.post(`${FORMIO_URL}/user/login`, body);
  const resp = await axios.post(`${FORMIO_URL}/admin/login`, body);
  return resp.headers['x-jwt-token'];
};

// define the home page route
router.use(formioLimiter);
router.use('/', async (req: RequestWithUser, res: express.Response) => {
  try {
    const method = req.method;
    const user: User = req.decodedJwt ? req.decodedJwt as User : {} as User;
    const token = await authToFormio(user);
    console.log('auth successful');

    const headers = {
      'x-jwt-token': token
    };

    // Build the proxied path by removing the mount prefix (e.g. /api/form)
    const formioBase = process.env.FORMIO_BASE_URL || '';
    // req.originalUrl contains the full original path + query (e.g. /api/form?q=)
    const mountPrefix = req.baseUrl || ''; // should be like '/api/form' when mounted
    let proxiedPath = req.originalUrl || req.url || '/';
    if (mountPrefix && proxiedPath.startsWith(mountPrefix)) {
      proxiedPath = proxiedPath.slice(mountPrefix.length) || '/';
    }
    // Ensure proxiedPath starts with '/'
    if (!proxiedPath.startsWith('/')) proxiedPath = '/' + proxiedPath;

    const targetUrl = formioBase + proxiedPath;
    console.log('Proxying to FormIO URL:', targetUrl);

    const response = await axios[method.toLowerCase()](targetUrl, { headers });
    res.json(response.data);
  } catch (error: any) {
    if (error.response && error.response.status === 401) {
      return res.status(404).json({ error: 'Page not found' });
    }
    console.error('FormIO request failed:', error?.message || error);
    res.status(500).json({ error: 'Failed to fetch FormIO data' });
  }
});

export default router;