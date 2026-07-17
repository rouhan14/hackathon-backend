import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { NotionAuthModule } from './auth/notion/notion-auth.module';
import { ConnectionsModule } from './integrations/connections/connections.module';
import { NotionModule } from './integrations/notion/notion.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ConnectionsModule,
    NotionModule,
    NotionAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
