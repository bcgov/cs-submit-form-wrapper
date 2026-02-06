import { Request, Response, NextFunction } from 'express'
import { expressjwt as jwt } from 'express-jwt'
import jwksRsa from 'jwks-rsa'

interface CheckJwtOptions {}

declare global {
  namespace Express {
    interface Request {
      decodedJwt?: {
        [key: string]: any
      }
      bceidType?: 'bceidbasic' | 'bceidbusiness'
      idpType?: 'idir' | 'bceidbasic' | 'bceidbusiness'
    }
  }
}

export const ROLE_FIELD = process.env.ROLE_FIELD || 'Role'

export const createJwtMiddleware = (options: CheckJwtOptions = {}) => {

  return jwt({
    secret: jwksRsa.expressJwtSecret({
      cache: true,
      jwksUri: process.env.JWKS_URI!,
      handleSigningKeyError: (err, cb) => {
        console.error('Error:', { error: err?.message, stack: err?.stack })
        cb(new Error('Error occurred during authentication'))
      },
    }),
    issuer: process.env.JWT_ISSUER!,
    audience: process.env.JWT_AUDIENCE,
    algorithms: ['RS256'],
    requestProperty: 'decodedJwt',
    getToken: function fromHeaderOrQuerystring(req) {
      const authHeader: string = req.headers.authorization!
      if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
        const token = authHeader.split(' ')[1]
        return token
      }
      const tokenHeader: string = req.headers['X-Jwt-Token'] as string || req.headers['x-jwt-token'] as string
      if (tokenHeader) {
        return tokenHeader
      }
      throw new Error('Error occurred during authentication')
    },
  })
}

export const checkJwt = (options: CheckJwtOptions = {}) => {
  const middleware = createJwtMiddleware(options)

  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err) => {
      if (err) {
        console.error('JWT Validation Error:', {
          error: err.message,
          code: err.code,
          inner: err.inner?.message,
        })

        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Error occurred during authentication',
          statusCode: 401,
        })
      }

      if (req.decodedJwt) {
        const provider = req.decodedJwt.idp || req.decodedJwt.identity_provider

        req.idpType = 'idir'
      }

      next()
    })
  }
}

export const extractOidcSub = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (req.decodedJwt) {
    console.log('Authenticated request', {
      sub: req.decodedJwt.sub,
      //   token: req.headers.authorization?.split(' ')[1]?.substring(0, 20) + '...',
      decodedJwt: req.decodedJwt,
    })
    next()
  } else {
    console.error('No decodedJwt found in request')
    res.status(401).json({ error: 'Error ocurred during authentication' })
  }
}

export const jwtErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err.name === 'UnauthorizedError') {
    console.error('JWT Validation Error (fallback):', {
      error: err.message,
      code: err.code,
      inner: err.inner?.message,
    })

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Error occurred during authentication',
      statusCode: 401,
    })
  }
  next(err)
}

export const hasRole = (user, role) => {
  return user && user[ROLE_FIELD] && user[ROLE_FIELD].includes(role);
}