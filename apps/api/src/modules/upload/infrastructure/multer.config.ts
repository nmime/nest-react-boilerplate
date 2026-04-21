import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { HttpException, HttpStatus } from '@nestjs/common'
import { diskStorage } from 'multer'

import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, UPLOAD_DIR } from '@/modules/upload/upload.constants'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const multerConfig: Record<string, any> = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (
      _req: unknown,
      file: Express.Multer.File,
      cb: (error: Error | null, filename: string) => void,
    ) => {
      const ext = path.extname(file.originalname)
      cb(null, `${randomUUID()}${ext}`)
    },
  }),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (ALLOWED_MIME_TYPES.test(file.mimetype)) {
      cb(null, true)
    } else {
      cb(
        new HttpException(
          `Unsupported file type: ${file.mimetype}. Allowed: images and PDF`,
          HttpStatus.UNPROCESSABLE_ENTITY,
        ),
        false,
      )
    }
  },
}
