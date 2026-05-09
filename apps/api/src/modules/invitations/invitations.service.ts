import { Injectable } from '@nestjs/common';

@Injectable()
export class InvitationsService {
  getHello(): string {
    return 'Hello from Invitations Service!';
  }
}
