import { Injectable } from '@nestjs/common';

@Injectable()
export class UploadsService {
  getHello(): string {
    return 'Hello from Uploads Service!';
  }
}
