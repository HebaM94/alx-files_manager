import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AppController {
  static getStatus(_request, response) {
    if (dbClient.isAlive() && redisClient.isAlive()) {
      response.status(200).json({ redis: true, db: true });
    }
  }

  static async getStats(_request, response, next) {
    try {
      const users = await dbClient.nbUsers();
      const files = await dbClient.nbFiles();
      response.status(200).json({ users, files });
    } catch (err) {
      next(err);
    }
  }
}

export default AppController;
