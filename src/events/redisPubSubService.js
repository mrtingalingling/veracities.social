import EventEmitter from 'events';
import Redis from 'ioredis';

export const CHANNELS = {
  DOCKET_NEW: 'veracities:docket:new',
  JUROR_VOTE: 'veracities:juror:vote',
  VERDICT_CONSENSUS: 'veracities:verdict:consensus',
  MARKET_STAKE: 'veracities:market:stake',
  ORACLE_SETTLED: 'veracities:oracle:settled'
};

export class RedisPubSubService {
  constructor(options = {}) {
    this.redisUrl = options.redisUrl || process.env.REDIS_URL || null;
    this.useRedis = Boolean(this.redisUrl) && !options.inMemoryOnly;

    this.pubClient = null;
    this.subClient = null;
    this.localEmitter = new EventEmitter();
    this.localCache = new Map();
    this.subscribers = new Map();

    if (this.useRedis) {
      try {
        this.pubClient = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
        this.subClient = new Redis(this.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });

        this.pubClient.on('error', (err) => {
          console.warn('[RedisPubSub] Redis pub error, falling back to in-memory:', err.message);
          this.useRedis = false;
        });

        this.subClient.on('error', (err) => {
          console.warn('[RedisPubSub] Redis sub error, falling back to in-memory:', err.message);
          this.useRedis = false;
        });

        this.subClient.on('message', (channel, message) => {
          try {
            const parsed = JSON.parse(message);
            this.localEmitter.emit(channel, parsed);
          } catch {
            this.localEmitter.emit(channel, message);
          }
        });
      } catch (err) {
        console.warn('[RedisPubSub] Failed to initialize Redis clients, using in-memory mode:', err.message);
        this.useRedis = false;
      }
    }
  }

  /**
   * Publishes an event to a designated channel.
   */
  async publish(channel, payload) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);

    if (this.useRedis && this.pubClient && this.pubClient.status === 'ready') {
      try {
        await this.pubClient.publish(channel, serialized);
      } catch (err) {
        console.warn(`[RedisPubSub] Live publish failed on ${channel}, using local emitter:`, err.message);
      }
    }

    // Always emit locally for local listeners and in-memory consumers
    this.localEmitter.emit(channel, typeof payload === 'string' ? JSON.parse(payload) : payload);
    return true;
  }

  /**
   * Subscribes to a channel with a handler.
   * Returns an unsubscribe function.
   */
  async subscribe(channel, handler) {
    this.localEmitter.on(channel, handler);

    if (this.useRedis && this.subClient && this.subClient.status === 'ready') {
      try {
        await this.subClient.subscribe(channel);
      } catch (err) {
        console.warn(`[RedisPubSub] Live subscribe failed on ${channel}:`, err.message);
      }
    }

    return () => {
      this.localEmitter.off(channel, handler);
      if (this.useRedis && this.subClient && this.subClient.status === 'ready') {
        const remaining = this.localEmitter.listenerCount(channel);
        if (remaining === 0) {
          this.subClient.unsubscribe(channel).catch(() => {});
        }
      }
    };
  }

  /**
   * Cache getter with TTL expiration handling.
   */
  async getCache(key) {
    if (this.useRedis && this.pubClient && this.pubClient.status === 'ready') {
      try {
        const val = await this.pubClient.get(key);
        return val ? JSON.parse(val) : null;
      } catch (err) {
        console.warn('[RedisPubSub] Cache get error:', err.message);
      }
    }

    const item = this.localCache.get(key);
    if (!item) return null;

    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.localCache.delete(key);
      return null;
    }
    return item.value;
  }

  /**
   * Cache setter with optional TTL in seconds.
   */
  async setCache(key, value, ttlSeconds = null) {
    const serialized = JSON.stringify(value);

    if (this.useRedis && this.pubClient && this.pubClient.status === 'ready') {
      try {
        if (ttlSeconds) {
          await this.pubClient.set(key, serialized, 'EX', ttlSeconds);
        } else {
          await this.pubClient.set(key, serialized);
        }
      } catch (err) {
        console.warn('[RedisPubSub] Cache set error:', err.message);
      }
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.localCache.set(key, { value, expiresAt });
    return true;
  }

  /**
   * Deletes a cached key.
   */
  async deleteCache(key) {
    if (this.useRedis && this.pubClient && this.pubClient.status === 'ready') {
      try {
        await this.pubClient.del(key);
      } catch (err) {
        console.warn('[RedisPubSub] Cache del error:', err.message);
      }
    }
    this.localCache.delete(key);
    return true;
  }

  async disconnect() {
    if (this.pubClient) {
      await this.pubClient.quit().catch(() => {});
    }
    if (this.subClient) {
      await this.subClient.quit().catch(() => {});
    }
    this.localEmitter.removeAllListeners();
    this.localCache.clear();
  }
}

export const redisPubSubService = new RedisPubSubService();
