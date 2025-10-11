import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MongoClient } from 'mongodb';

@Injectable()
export class MongoService
  extends MongoClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.close();
  }
}
