export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function errorHandler(error, _req, res, _next) {
  if (error?.code === 'P2002') return res.status(409).json({ message: 'A record with those details already exists.' });
  if (error?.code === 'P2025') return res.status(404).json({ message: 'Record not found.' });
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message, ...(error.details ? { details: error.details } : {}) });
  if (error?.name === 'ZodError') return res.status(400).json({ message: 'Request validation failed.', details: error.issues.map(({ path, message }) => ({ path: path.join('.'), message })) });
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Request body must contain valid JSON.' });
  if (error?.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' });
  if (process.env.NODE_ENV !== 'production') console.error(error);
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
}
