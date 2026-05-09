import { Injectable } from '@nestjs/common';

@Injectable()
export class TenantsService {
  getHello(): string {
    return 'Hello from Tenants Service!';
  }
}
