import sha1 from 'sha1';
import { ObjectID } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  static async postNew(request, response) {
    const { email, password } = request.body;
    if (!email) return response.status(400).send({ error: 'Missing email' });
    if (!password) return response.status(400).send({ error: 'Missing password' });
    const userExists = await dbClient.db.collection('users').findOne({ email });
    if (userExists) {
      return response.status(400).json({ error: 'Already exist' });
    }

    const hashedPassword = sha1(password).toString();
    const newUser = await dbClient.db.collection('users').insertOne({
      email,
      password: hashedPassword,
    });

    return response.status(201).json({
      email,
      id: newUser.insertedId,
    });
  }

  static async getMe(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
    }
    const users = dbClient.db.collection('users');
    const idObj = new ObjectID(userId);
    users.findOne({ _id: idObj }, { projection: { email: 1 } }, (err, user) => {
      if (user) {
        response.status(200).json({ id: userId, email: user.email });
      } else {
        response.status(401).json({ error: 'Unauthorized' });
      }
    });
  }
}

export default UsersController;
