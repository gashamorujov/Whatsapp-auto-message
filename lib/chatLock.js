/**
 * chatLock — eyni açar (çat) üçün əməliyyatları ardıcıl icra edən mutex.
 *
 * Eyni istifadəçinin paralel sorğuları (iki dəfə toxunuş, sürətli mesajlar)
 * bir-birinin state-ini pozmasın deyə handler-lər çat üzrə növbələnir.
 */
class KeyedMutex {
  constructor(timeoutMs = 120000) {
    this.timeoutMs = timeoutMs;
    this.tails = new Map();
    this.pending = new Map();
  }

  /**
   * @template T
   * @param {string|number} key
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  run(key, fn) {
    const k = String(key);
    const prev = this.tails.get(k) || Promise.resolve();
    this.pending.set(k, (this.pending.get(k) || 0) + 1);

    let timer;
    const waitPrev = Promise.race([
      prev.catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(resolve, this.timeoutMs);
      }),
    ]).then(() => clearTimeout(timer));

    const result = waitPrev.then(() => fn());
    const tail = result
      .catch(() => {})
      .then(() => {
        const left = (this.pending.get(k) || 1) - 1;
        if (left <= 0) {
          this.pending.delete(k);
          if (this.tails.get(k) === tail) this.tails.delete(k);
        } else {
          this.pending.set(k, left);
        }
      });
    this.tails.set(k, tail);
    return result;
  }

  get size() {
    return this.tails.size;
  }
}

module.exports = { KeyedMutex };
