import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import Queue from 'bull';
import mime from 'mime-types';
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
      return response.status(401).json({ error: 'Unauthorized' });
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
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const users = dbClient.db.collection('users');
    const idObj = new ObjectID(userId);
    const user = await users.findOne({ _id: idObj });
    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const fileId = request.params.id;

    try {
      const files = dbClient.db.collection('files');
      const fileObj = new ObjectID(fileId);
      const file = await files.findOne({ _id: fileObj });
      if (!file || (file.userId.toString() !== userId && !file.isPublic)) {
        return response.status(404).json({ error: 'Not found' });
      }
      return response.status(200).json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      });
    } catch (error) {
      return response.status(404).json({ error: 'Not found' });
    }
  }

  static async getIndex(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const users = dbClient.db.collection('users');
    const idObj = new ObjectID(userId);
    const user = await users.findOne({ _id: idObj });
    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    let { parentId } = request.query;
    parentId = parentId || null;
    const page = parseInt(request.query.page, 10) || 0;
    const pageSize = 20;

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
        { $sort: { _id: 1 } },
        { $skip: page * pageSize },
        { $limit: pageSize },
      ]).toArray();

      return response.status(200).json(filesArray.map((file) => ({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      })));
    } catch (error) {
      return response.status(500).json({ error: 'Internal server error' });
    }
  }

  static async putPublish(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const users = dbClient.db.collection('users');
    const idObj = new ObjectID(userId);
    const user = await users.findOne({ _id: idObj });
    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const fileId = request.params.id;
    const idObjFile = new ObjectID(fileId);
    const files = dbClient.db.collection('files');
    const file = await files.findOne({ _id: idObjFile });
    if (!file || file.userId.toString() !== userId) {
      return response.status(404).json({ error: 'Not found' });
    }
    await files.updateOne({ _id: idObjFile }, { $set: { isPublic: true } });
    return response.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: true,
      parentId: file.parentId,
    });
  }

  static async putUnpublish(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const users = dbClient.db.collection('users');
    const idObj = new ObjectID(userId);
    const user = await users.findOne({ _id: idObj });
    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }
    const fileId = request.params.id;
    const idObjFile = new ObjectID(fileId);
    const files = dbClient.db.collection('files');
    const file = await files.findOne({ _id: idObjFile });
    if (!file || file.userId.toString() !== userId) {
      return response.status(404).json({ error: 'Not found' });
    }
    await files.updateOne({ _id: idObjFile }, { $set: { isPublic: false } });
    return response.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: false,
      parentId: file.parentId,
    });
  }

  static async getFile(request, response) {
    const { id } = request.params;
    const size = request.query.size || null;
    const files = dbClient.db.collection('files');
    const idObject = new ObjectID(id);

    try {
      const file = await files.findOne({ _id: idObject });
      let fileName = file.localPath;

      if (!file) {
        return response.status(404).json({ error: 'Not found' });
      }
      if (file.isPublic) {
        if (file.type === 'folder') {
          return response.status(400).json({ error: "A folder doesn't have content" });
        }

        if (size) {
          const validSizes = ['500', '250', '100'];
          if (!validSizes.includes(size)) {
            return response.status(400).json({ error: 'Invalid size parameter' });
          }
          fileName = `${file.localPath}_${size}`;
          try {
            await fs.access(fileName);
            const data = await fs.readFile(fileName);
            const contentType = mime.contentType(file.name);
            return response.header('Content-Type', contentType).status(200).send(data);
          } catch (err) {
            return response.status(404).json({ error: 'Not found' });
          }
        }

        const data = await fs.readFile(fileName);
        const contentType = mime.contentType(file.name);
        return response.header('Content-Type', contentType).status(200).send(data);
      }

      const token = request.header('X-Token');
      const key = `auth_${token}`;
      const userId = await redisClient.get(key);

      if (!userId) {
        return response.status(404).json({ error: 'Not found' });
      }

      const users = dbClient.db.collection('users');
      const idObj = new ObjectID(userId);
      const user = await users.findOne({ _id: idObj });

      if (!user || file.userId.toString() !== user._id.toString()) {
        return response.status(404).json({ error: 'Not found' });
      }

      if (file.userId.toString() === user._id.toString()) {
        if (file.type === 'folder') {
          return response.status(400).json({ error: "A folder doesn't have content" });
        }

        if (size) {
          const validSizes = ['500', '250', '100'];
          if (!validSizes.includes(size)) {
            return response.status(400).json({ error: 'Invalid size parameter' });
          }
          fileName = `${file.localPath}_${size}`;
          try {
            await fs.access(fileName);
            const data = await fs.readFile(fileName);
            const contentType = mime.contentType(file.name);
            return response.header('Content-Type', contentType).status(200).send(data);
          } catch (err) {
            return response.status(404).json({ error: 'Not found' });
          }
        }
        const contentType = mime.contentType(file.name);
        return response.header('Content-Type', contentType).status(200).sendFile(fileName);
      }
    } catch (error) {
      return response.status(404).json({ error: 'Not found' });
    }
    return null;
  }
}

export default FilesController;
