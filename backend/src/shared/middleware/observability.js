import { randomUUID } from 'crypto';

export function logEvent(event, fields = {}) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    event,
    ...fields,
  }));
}

export function requestContext(req, res, next) {
  const startedAt = process.hrtime.bigint();
  req.correlationId = randomUUID();
  res.setHeader('x-correlation-id', req.correlationId);

  res.on('finish', () => {
    logEvent('http.request.completed', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
    });
  });

  next();
}
