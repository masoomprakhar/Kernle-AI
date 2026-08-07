import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: false });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: (process.env.WEB_ORIGIN || 'http://localhost:3001').split(','),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Kernle AI API')
    .setDescription('Multi-tenant PIM platform API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`Kernle API listening on http://localhost:${port}/api`);
}

bootstrap();
