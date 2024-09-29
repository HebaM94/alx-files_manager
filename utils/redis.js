import { createClient } from 'redis';
import { promisify } from 'util';

class RedisClient {
  constructor() {
    this.client = createClient();
    this.client.on('error', (err) => {
      console.log(err.message);
    });
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    this.getAsync = promisify(this.client.get).bind(this.client);
    const value = await this.getAsync(key);
    return value;
  }

  async set(key, value, duration) {
    this.setAsync = promisify(this.client.set).bind(this.client);
    await this.setAsync(key, value, 'EX', duration);
  }

  async del(key) {
    this.delAsync = promisify(this.client.del).bind(this.client);
    await this.delAsync(key);
  }
}

const redisClient = new RedisClient();
export default redisClient;
