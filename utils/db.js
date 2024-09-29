import { MongoClient } from 'mongodb';

const HOST = process.env.DB_HOST || 'localhost';
const PORT = process.env.DB_PORT || 27017;
const DATABASE = process.env.DB_DATABASE || 'files_manager';
const url = `mongodb://${HOST}:${PORT}`;

class DBClient {
  constructor() {
    MongoClient.connect(url, { useUnifiedTopology: true }, (error, client) => {
      if (error) console.log(error);
      this.db = client.db(DATABASE);
      this.db.createCollection('users');
      this.db.createCollection('files');
    });
  }

  async isAlive() {
    return !!this.db;
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
