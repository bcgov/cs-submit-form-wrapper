import express from 'express';
const router = express.Router();
import axios from 'axios';

const FORMIO_URL = process.env.FORMIO_BASE_URL;
const FORMIO_ADMIN_USER = process.env.FORMIO_ADMIN_USERNAME;
const FORMIO_ADMIN_PASS = process.env.FORMIO_ADMIN_PASSWORD;
const FORMIO_MANAGER_USER = process.env.FORMIO_MANAGER_USERNAME;
const FORMIO_MANAGER_PASS = process.env.FORMIO_MANAGER_PASSWORD;
import { User, ADMIN } from '../types/user';
import { hasRole } from '../middleware/auth';

type RequestWithUser = express.Request & { user?: User };

const authToFormio = async (user: User) => {
  const body = {
    data: {
      email: '',
      password: '',
    },
  };
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
router.use('/', async (req: RequestWithUser, res: express.Response) => {
  try {
    const method = req.method;
    const user: User = req.user ? (req.user as User) : ({} as User);
    const token = await authToFormio(user);
    console.log('auth successful', token);

    const headers = {
      'x-jwt-token': token,
    };

    // console.log('Making request with headers:', headers);
    const response = await axios[method.toLowerCase()](process.env.FORMIO_BASE_URL + req.path, {
      headers,
    });
    //console.log('FormIO response:', response.status, response.data);
    res.json(response.data);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      return res.status(404).json({ error: 'Page not found' });
    }
    console.error('FormIO request failed:', error);
    res.status(500).json({ error: 'Failed to fetch FormIO data' });
  }
});

export default router;
