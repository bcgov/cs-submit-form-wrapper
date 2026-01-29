import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
console.log('JWT Secret:', process.env.JWT_SECRET);
var opts = {};
opts.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
opts.secretOrKey = process.env.JWT_SECRET;
opts.issuer = process.env.JWT_ISSUER;
opts.audience = process.env.JWT_AUDIENCE;
const ROLE_FIELD = process.env.ROLE_FIELD || 'Role';

passport.use(
  new JwtStrategy(opts, (payload, done) => {
    console.log('Valid JWT', payload);
    return done(null, payload);
  }),
);

export const hasRole = (user, role) => {
  return user && user[ROLE_FIELD] && user[ROLE_FIELD].includes(role);
};

console.log('opts:', opts);

export const authenticate = passport.authenticate('jwt', { session: false });

export default authenticate;
