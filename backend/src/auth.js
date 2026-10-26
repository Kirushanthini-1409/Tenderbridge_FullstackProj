import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import { HttpError } from './errors.js';
import { getDb } from './db.js';

let jwks;
function getJwks() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  if (!base) throw new HttpError(503, 'Authentication is not configured. Set SUPABASE_URL.');
  jwks ??= createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  return { jwks, issuer: `${base}/auth/v1` };
}

export async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    if (!header.startsWith('Bearer ')) throw new HttpError(401, 'A valid Supabase access token is required.');
    const token = header.slice(7);
    const { issuer, jwks } = getJwks();
    const verifyOptions = { issuer, audience: 'authenticated' };
    const algorithm = decodeProtectedHeader(token).alg;
    let payload;
    if (algorithm === 'HS256') {
      if (!process.env.SUPABASE_JWT_SECRET) {
        throw new HttpError(503, 'This Supabase project uses HS256 tokens. Set SUPABASE_JWT_SECRET in backend/.env.');
      }
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET), { ...verifyOptions, algorithms: ['HS256'] }));
    } else if (['ES256', 'RS256', 'EdDSA'].includes(algorithm)) {
      ({ payload } = await jwtVerify(token, jwks, { ...verifyOptions, algorithms: [algorithm] }));
    } else {
      throw new HttpError(401, 'The Supabase access token uses an unsupported signing algorithm.');
    }
    if (typeof payload.sub !== 'string' || !payload.sub) throw new HttpError(401, 'The access token has no user identity.');
    const metadata = payload.app_metadata && typeof payload.app_metadata === 'object' ? payload.app_metadata : {};
    // Admin comes only from trusted app_metadata. Public registration may
    // request a business or organization workspace via user_metadata.
    const userMetadata = payload.user_metadata && typeof payload.user_metadata === 'object' ? payload.user_metadata : {};
    const requestedRole = String(userMetadata.requested_role || '').toUpperCase();
    let role = String(metadata.role || (requestedRole === 'ORGANIZATION' ? 'ORGANIZATION' : 'BUSINESS')).toUpperCase();
    if (role !== 'ADMIN' && role === 'ORGANIZATION') {
      const assignments = getDb()?.accountRoleAssignment;
      if (assignments?.upsert) {
        await assignments.upsert({
          where: { ownerAuthId: payload.sub },
          create: { ownerAuthId: payload.sub, role: 'ORGANIZATION' },
          update: { role: 'ORGANIZATION' },
        });
      }
    }
    req.auth = {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      role,
      organizationId: typeof metadata.organization_id === 'string' ? metadata.organization_id : null,
    };
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    if (error?.code?.startsWith('P')) return next(new HttpError(503, 'Could not load your account role. Check the database connection and migrations.'));
    if (process.env.NODE_ENV !== 'production') console.warn('Supabase token verification failed:', error?.code || error?.message || 'unknown error');
    return next(new HttpError(401, 'The access token is invalid or expired. Check the Supabase URL, token signing key, and system time.'));
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => req.auth && roles.includes(req.auth.role)
    ? next()
    : next(new HttpError(req.auth ? 403 : 401, req.auth ? 'You do not have permission to perform this action.' : 'Authentication is required.'));
}
