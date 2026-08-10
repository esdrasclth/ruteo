import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const enProduccion = config.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix('api');

  // Un salto de proxy de confianza (nginx/Caddy en el propio VPS). Con esto
  // `request.ip` es la IP real del cliente y NO el último valor que alguien
  // haya querido escribir en `X-Forwarded-For`.
  //
  // El número importa: `trust proxy: true` haría que Express se creyera la
  // cabecera entera, que es exactamente el agujero que esto cierra. Si algún
  // día hay un CDN por delante, sube el número al total de saltos de confianza.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3001'),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Sin esto, `docker stop` mata el proceso con peticiones y jobs a medias:
  // Nest no cierra Prisma, ioredis ni los workers de BullMQ.
  app.enableShutdownHooks();

  // Swagger describe cada endpoint, cada DTO y cada ejemplo. En desarrollo es
  // la documentación; en internet es el mapa de la superficie de ataque servido
  // por nosotros mismos. Se monta solo fuera de producción.
  if (!enProduccion) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ruteo API')
      .setDescription('SaaS multi-tenant de rastreo de encomiendas')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
}
void bootstrap();
