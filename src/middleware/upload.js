import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/jpg,image/webp').split(',');
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, JPG and WebP images are allowed.'), false);
  }
};

// Multer configuration for memory storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB default
  },
  fileFilter: fileFilter,
});

export const uploadSingle = upload.single('image');
export const uploadMultiple = upload.array('images', 300); // Max 300 images at a time

// Flexible upload that handles both single and multiple
export const uploadAny = upload.any();

export default { uploadSingle, uploadMultiple, uploadAny };
