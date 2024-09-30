import sha1 from 'crypto-js/sha1';
import dbClient from '../utils/db';

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
}
export default UsersController;
