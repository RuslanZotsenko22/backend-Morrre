import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { MongoServerError } from 'mongodb';

@Catch(MongoServerError)
export class MongoDuplicateKeyFilter implements ExceptionFilter {
  catch(exception: MongoServerError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();

    if (exception.code === 11000) {
      const fields = Object.keys((exception as any)?.keyPattern ?? {});
      let message = 'Duplicate key';
      if (fields.includes('username')) message = 'Username already in use';
      else if (fields.includes('email')) message = 'Email already in use';

      const err = new BadRequestException(message);
      const responseBody: any = err.getResponse();
      return res.status(err.getStatus()).json(responseBody);
    }

    // інші mongo-помилки віддаємо як є
    return res.status(500).json({
      statusCode: 500,
      message: exception.message ?? 'Internal server error',
    });
  }
}
