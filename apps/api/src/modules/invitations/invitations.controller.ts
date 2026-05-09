import { Controller, Get } from '@nestjs/common';
import { InvitationsService } from './invitations.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  getHello(): string {
    return this.invitationsService.getHello();
  }
}
