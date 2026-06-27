import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { FilesService } from "./files.service.js";

@ApiTags("files")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("services/:serviceId/files")
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get()
  @RequirePermission("services:files")
  list(@Param("serviceId") serviceId: string, @Query("path") requested = ".") {
    return this.files.list(serviceId, requested);
  }

  @Get("content")
  @RequirePermission("services:files")
  read(@Param("serviceId") serviceId: string, @Query("path") requested: string, @Query("create") create?: string, @Query("type") type?: string, @Query("template") template?: string) {
    return this.files.read(serviceId, requested, { create: create === "true", type, template });
  }

  @Put("content")
  @RequirePermission("services:files")
  write(@Param("serviceId") serviceId: string, @Body() body: { path: string; content: string }) {
    return this.files.write(serviceId, body.path, body.content);
  }

  @Post("mkdir")
  @RequirePermission("services:files")
  mkdir(@Param("serviceId") serviceId: string, @Body() body: { path: string }) {
    return this.files.mkdir(serviceId, body.path);
  }
}
