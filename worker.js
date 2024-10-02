import Queue from 'bull';
import imageThumbnail from 'image-thumbnail';
import { promises as fs } from 'fs';
import { ObjectID } from 'mongodb';
import dbClient from './utils/db';

const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');
const userQueue = new Queue('userQueue', 'redis://127.0.0.1:6379');

async function createThumbnail(width, localPath) {
  return imageThumbnail(localPath, { width });
}

fileQueue.process(async (job, done) => {
  const { fileId, userId } = job.data;

  if (!fileId) return done(new Error('Missing fileId'));
  if (!userId) return done(new Error('Missing userId'));

  console.log(fileId, userId);

  try {
    const files = dbClient.db.collection('files');
    const idObject = new ObjectID(fileId);
    const userObject = new ObjectID(userId);
    const file = files.findOne({ _id: idObject, userId: userObject });
    if (!file) {
      console.log('Not found');
      done(new Error('File not found'));
    }
    const fileName = file.localPath;

    const thumbNails = [500, 250, 100].map(async (width) => {
      const thumbnail = await createThumbnail(width, fileName);
      await fs.writeFile(`${fileName}_${width}`, thumbnail);
    });

    await Promise.all(thumbNails);
    done();
  } catch (error) {
    console.error('Error processing file:', error);
    done(new Error('Error processing file'));
  }
  return null;
});

userQueue.process(async (job, done) => {
  const { userId } = job.data;
  if (!userId) done(new Error('Missing userId'));

  const users = dbClient.db.collection('users');
  const idObject = new ObjectID(userId);
  const user = await users.findOne({ _id: idObject });
  if (user) {
    console.log(`Welcome ${user.email}!`);
  } else {
    done(new Error('User not found'));
  }
});
