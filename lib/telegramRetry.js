/**
 * telegramRetry — Telegram Bot API çağırışları üçün təhlükəsiz retry.
 *
 *  - 429 (Too Many Requests): Telegram-ın verdiyi retry_after qədər gözlə;
 *  - şəbəkə/5xx xətaları: exponential backoff (məhdud sayda);
 *  - "message is not modified": xəta deyil — səssiz keçilir;
 *  - qalan xətalar (chat not found, bot blocked, …) dərhal atılır.
 */
const { sleep } = require('./myfunc');

function errText(err) {
  return String(err?.message || err?.response?.body?.description || err || '');
}

/** @returns {number|null} saniyə */
function retryAfterSeconds(err) {
  const fromBody = err?.response?.body?.parameters?.retry_after;
  if (Number.isFinite(fromBody)) return fromBody;
  const m = errText(err).match(/retry after (\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function isRateLimited(err) {
  return err?.response?.statusCode === 429 || /\b429\b|too many requests/i.test(errText(err));
}

function isNotModified(err) {
  return /message is not modified/i.test(errText(err));
}

/** Mesaj/çat artıq yoxdur və ya bot bloklanıb — retry mənasızdır. */
function isPermanent(err) {
  return /message to edit not found|message can't be edited|message_id_invalid|chat not found|bot was blocked|user is deactivated|forbidden|message to delete not found|bad request/i.test(
    errText(err)
  );
}

function isTransient(err) {
  const code = err?.code || err?.cause?.code;
  const status = err?.response?.statusCode;
  if (status && status >= 500) return true;
  return (
    ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED', 'EPIPE', 'EFATAL'].includes(code) ||
    /timeout|socket hang up|network/i.test(errText(err))
  );
}

/**
 * @param {() => Promise<any>} fn
 * @param {{maxRetries?: number, maxWaitMs?: number, sleepFn?: (ms:number)=>Promise<void>}} [opts]
 */
async function withTelegramRetry(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? 3;
  const maxWaitMs = opts.maxWaitMs ?? 60000;
  const sleepFn = opts.sleepFn || sleep;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (isNotModified(err)) return null;
      if (attempt >= maxRetries || isPermanent(err)) throw err;

      let waitMs = null;
      if (isRateLimited(err)) {
        const sec = retryAfterSeconds(err);
        waitMs = ((sec ?? 5) + 1) * 1000;
      } else if (isTransient(err)) {
        waitMs = Math.min(1000 * 2 ** attempt, 15000);
      }
      if (waitMs === null || waitMs > maxWaitMs) throw err;
      attempt++;
      await sleepFn(waitMs);
    }
  }
}

module.exports = {
  withTelegramRetry,
  retryAfterSeconds,
  isRateLimited,
  isNotModified,
  isPermanent,
  isTransient,
};
