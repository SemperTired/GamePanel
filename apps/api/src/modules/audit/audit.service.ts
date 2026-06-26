import { Injectable } from "@nestjs/common";
import { DataStore } from "../data.module.js";

@Injectable()
export class AuditService {
  constructor(private readonly data: DataStore) {}

  record(actor: string, action: string, target: string, detail: unknown = {}) {
    const entry = { id: crypto.randomUUID(), actor, action, target, detail, created_at: new Date().toISOString() };
    this.data.audits.unshift(entry);
    return entry;
  }

  list() {
    return this.data.audits.slice(0, 500);
  }
}
