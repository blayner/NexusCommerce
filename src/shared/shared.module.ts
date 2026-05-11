import { Global, Module } from '@nestjs/common';
import { EventBus } from './application/event-bus';

@Global()
@Module({
  providers: [EventBus],
  exports: [EventBus],
})
export class SharedModule {}
