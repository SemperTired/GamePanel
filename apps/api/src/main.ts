import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./modules/app.module.js";

const port = Number(process.env.API_PORT || 4100);
const app = await NestFactory.create(AppModule);
app.setGlobalPrefix("api/v1");
app.use(helmet());
app.enableCors({
  origin: process.env.PUBLIC_APP_URL || "http://127.0.0.1:4000",
  credentials: true,
});
app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

const config = new DocumentBuilder()
  .setTitle("AetherPanel API")
  .setDescription("Game server hosting control panel API")
  .setVersion("0.1.0")
  .addBearerAuth()
  .build();
SwaggerModule.setup("/api/docs", app, SwaggerModule.createDocument(app, config));

await app.listen(port, "0.0.0.0");
console.log(`AetherPanel API listening on ${port}`);
