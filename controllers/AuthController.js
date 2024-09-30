import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(request, response) {
    const authHeader = request.header('Authorization');
    let authData = authHeader.split(' ')[1];
    const decData = Buffer.from(authData, 'base64');
    authData = decData.toString('ascii');
    const [uemail, password] = authData.split(':');
    if (!uemail || !password) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const hashedPassword = sha1(password);
    const users = await dbClient.db.collection('users');
    users.findOne({ email: uemail, password: hashedPassword }, async (err, user) => {
      if (!user) {
        response.status(401).json({ error: 'Unauthorized' });
      }
      const token = uuidv4();
      const key = `auth_${token}`;
      await redisClient.set(key, user._id.toString(), 86400);
      response.status(200).json({ token });
    });
  }

  static async getDisconnect(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const id = await redisClient.get(key);
    if (id) {
      await redisClient.del(key);
      response.status(204).send();
    } else {
      response.status(401).json({ error: 'Unauthorized' });
    }
  }
}

export default AuthController;
