import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const HOST = process.env.DB_HOST || 'localhost';
    const PORT = process.env.DB_PORT || 27017;
    const DATABASE = process.env.DB_DATABASE || 'files_manager';
    const url = `mongodb://${HOST}:${PORT}`;
    this.client = new MongoClient(url, { useUnifiedTopology: true, useNewUrlParser: true });
    this.isConnected = false;
    this.client.connect()
      .then(() => {
        this.isConnected = true;
        this.db = this.client.db(DATABASE);
      })
      .catch(() => {
        this.isConnected = false;
      });
  }

  async isAlive() {
    return this.isConnected;
  }

  async nbUsers() {
    const collection = this.db.collection('users');
    const usersNum = await collection.countDocuments();
    return usersNum;
  }

  async nbFiles() {
    const collection = this.db.collection('files');
    const filesNum = await collection.countDocuments();
    return filesNum;
  }
}

const dbClient = new DBClient();
export default dbClient;
