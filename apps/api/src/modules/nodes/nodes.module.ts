import { Module } from "@nestjs/common";
import { NodesController } from "./nodes.controller.js";

@Module({ controllers: [NodesController] })
export class NodesModule {}
