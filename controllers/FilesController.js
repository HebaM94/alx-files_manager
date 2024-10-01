import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import Queue from 'bull';
import { ObjectID } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');

class FilesController {
  static async postUpload(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
    }
    const users = dbClient.db.collection('users');
    const idObj = new ObjectID(userId);
    const user = await users.findOne({ _id: idObj });
    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const { name, type } = request.body;
    const parentId = request.body.parentId || 0;
    const isPublic = request.body.isPublic || false;
    const { data } = request.body;
    if (!name) {
      return response.status(400).json({ error: 'Missing name' });
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return response.status(400).json({ error: 'Missing type' });
    }
    if (!data && type !== 'folder') {
      return response.status(400).json({ error: 'Missing data' });
    }

    const files = dbClient.db.collection('files');

    if (parentId) {
      const idObject = new ObjectID(parentId);
      const file = await files.findOne({ _id: idObject, userId: user._id });
      if (!file) {
        return response.status(400).json({ error: 'Parent not found' });
      }
      if (file.type !== 'folder') {
        return response.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    if (type === 'folder') {
      files.insertOne(
        {
          userId: user._id,
          name,
          type,
          parentId: parentId || 0,
          isPublic,
        },
      ).then((result) => response.status(201).json({
        id: result.insertedId,
        userId: user._id,
        name,
        type,
        isPublic,
        parentId: parentId || 0,
      })).catch((error) => {
        console.log(error);
      });
    } else {
      const filePath = process.env.FOLDER_PATH || '/tmp/files_manager';
      const fileName = `${filePath}/${uuidv4()}`;
      const buff = Buffer.from(data, 'base64');
      try {
        await fs.mkdir(filePath, { recursive: true });
        await fs.writeFile(fileName, buff);
      } catch (error) {
        console.log(error);
      }
      files.insertOne(
        {
          userId: user._id,
          name,
          type,
          isPublic,
          parentId: parentId || 0,
          localPath: fileName,
        },
      ).then((result) => {
        response.status(201).json(
          {
            id: result.insertedId,
            userId: user._id,
            name,
            type,
            isPublic,
            parentId: parentId || 0,
          },
        );

        if (type === 'image') {
          fileQueue.add(
            {
              userId: user._id,
              fileId: result.insertedId,
            },
          );
        }
      }).catch((error) => console.log(error));
    }
    return null;
  }

  static async getShow(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
    }
    const users = dbClient.db.collection('users');
    const idObj = new ObjectID(userId);
    const user = await users.findOne({ _id: idObj });
    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const fileId = request.params.id;
    const files = dbClient.db.collection('files');
    const fileObj = new ObjectID(fileId);
    try {
      const file = await files.findOne({ _id: fileObj, userId: user._id });
      if (!file) {
        return response.status(404).json({ error: 'Not found' });
      }
      return response.status(200).json(file);
    } catch (error) {
      console.log(error);
      return response.status(404).json({ error: 'Not found' });
    }
  }

  static async getIndex(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      response.status(401).json({ error: 'Unauthorized' });
    }
    const users = dbClient.db.collection('users');
    const idObj = new ObjectID(userId);
    const user = await users.findOne({ _id: idObj });
    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const parentId = request.query.parentId || 0;
    const { page } = request.query;
    const pageNum = page || 0;
    const files = dbClient.db.collection('files');
    let query;
    if (!parentId) {
      query = { userId: user._id };
    } else {
      query = { userId: user._id, parentId: ObjectID(parentId) };
    }
    try {
      const filesArray = await files.aggregate([
        { $match: query },
        { $skip: page * pageNum },
        { $limit: pageNum },
      ]).toArray();
      return response.status(200).json(filesArray);
    } catch (error) {
      return response.status(404).json({ error: 'Not found' });
    }
  }
}

export default FilesController;
