import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { ObjectID } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class FilesController {
  static async postUpload(request, response) {
    const token = request.header('X-Token');
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const { name } = request.body;
    const { type } = request.body;
    const { parentId } = request.body.parentId || '0';
    const isPublic = request.body.isPublic || false;
    const { data } = request.body;
    if (!name) {
      return response.status(400).json({ error: 'Missing name' });
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return response.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return response.status(400).json({ error: 'Missing data' });
    }

    const files = dbClient.db.collection('files');
    if (parentId) {
      const idObject = new ObjectID(parentId);
      const file = await files.findOne({ _id: idObject, userId });
      if (!file) {
        return response.status(400).json({ error: 'Parent not found' });
      }
      if (file.type !== 'folder') {
        return response.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    if (type === 'folder') {
      const newFolder = {
        userId,
        name,
        type,
        isPublic,
        parentId: parentId || 0,
      };
      const result = await files.insertOne(newFolder);
      return response.status(201).json({
        id: result.insertedId,
        userId,
        name,
        type,
        isPublic,
        parentId: newFolder.parentId,
      });
    }
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

    await fs.mkdir(folderPath, { recursive: true });

    const fileUUID = uuidv4();
    const localPath = path.join(folderPath, fileUUID);

    const fileData = Buffer.from(data, 'base64');
    await fs.writeFile(localPath, fileData);

    const newFile = {
      userId,
      name,
      type,
      isPublic,
      parentId: parentId || '0',
      localPath,
    };
    const result = await files.insertOne(newFile);

    return response.status(201).json({
      id: result.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId: newFile.parentId,
    });
  }
}

export default FilesController;
