import { diskStorage } from 'multer';
import { extname } from 'path';

export const uploadImageMulter = {
  storage: diskStorage({
    destination: './tmp',
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, unique + extname(file.originalname));
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
};
