import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const HOST = process.env.DB_HOST || 'localhost';
    const PORT = process.env.DB_PORT || 27017;
    const DATABASE = process.env.DB_DATABASE || 'files_manager';
    const url = `mongodb://${HOST}:${PORT}/${DATABASE}`;
    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.client.connect().then(() => {
      this.db = this.client.db(DATABASE);
    }).catch((err) => {
      console.log(err);
    });
  }

  isAlive() {
    if (this.client.topology.isConnected()) return true;
    return false;
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
