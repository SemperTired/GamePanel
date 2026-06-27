import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { DataStore, ScheduledTaskRecord } from "../data.module.js";
import { ServicesService } from "../services/services.service.js";

const taskActions = ["start", "stop", "restart", "kill", "backup", "command"] as const;
const taskCadences = ["manual", "hourly", "daily", "weekly", "interval"] as const;

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = new Set<string>();

  constructor(private readonly data: DataStore, private readonly services: ServicesService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.runDueTasks().catch((error) => console.error("[scheduler]", error)), Number(process.env.SCHEDULER_TICK_MS || 60000));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  list(serviceId?: string) {
    const tasks = [...this.data.scheduledTasks.values()];
    return (serviceId ? tasks.filter((task) => task.service_id === serviceId) : tasks).sort((a, b) => (a.next_run_at || "").localeCompare(b.next_run_at || ""));
  }

  async create(input: unknown) {
    if (!input || typeof input !== "object") throw new BadRequestException("Task body is required");
    const body = input as Record<string, unknown>;
    const serviceId = String(body.service_id || "");
    if (!this.data.services.has(serviceId)) throw new BadRequestException("Unknown service_id");
    const action = String(body.action || "");
    const cadence = String(body.cadence || "manual");
    if (!taskActions.includes(action as ScheduledTaskRecord["action"])) throw new BadRequestException("Unsupported task action");
    if (!taskCadences.includes(cadence as ScheduledTaskRecord["cadence"])) throw new BadRequestException("Unsupported task cadence");
    if (action === "command" && !String(body.command || "").trim()) throw new BadRequestException("Command tasks require a command");
    const now = new Date().toISOString();
    const task: ScheduledTaskRecord = {
      id: crypto.randomUUID(),
      service_id: serviceId,
      name: String(body.name || `${action} ${cadence}`),
      action: action as ScheduledTaskRecord["action"],
      cadence: cadence as ScheduledTaskRecord["cadence"],
      enabled: body.enabled !== false,
      run_at: typeof body.run_at === "string" ? body.run_at : undefined,
      interval_minutes: Number(body.interval_minutes || 0) || undefined,
      day_of_week: Number(body.day_of_week ?? 0),
      time_of_day: typeof body.time_of_day === "string" ? body.time_of_day : "04:00",
      command: typeof body.command === "string" ? body.command : undefined,
      created_at: now,
      updated_at: now,
    };
    task.next_run_at = this.nextRun(task, new Date(now));
    await this.data.saveScheduledTask(task);
    return task;
  }

  async update(id: string, input: unknown) {
    const task = this.data.scheduledTasks.get(id);
    if (!task) throw new BadRequestException("Unknown task");
    if (!input || typeof input !== "object") throw new BadRequestException("Task body is required");
    const body = input as Record<string, unknown>;
    if (typeof body.name === "string" && body.name.trim()) task.name = body.name.trim();
    if (typeof body.enabled === "boolean") task.enabled = body.enabled;
    if (typeof body.command === "string") task.command = body.command;
    if (typeof body.time_of_day === "string") task.time_of_day = body.time_of_day;
    if (body.interval_minutes !== undefined) task.interval_minutes = Number(body.interval_minutes) || undefined;
    if (body.day_of_week !== undefined) task.day_of_week = Number(body.day_of_week);
    if (typeof body.run_at === "string") task.run_at = body.run_at;
    task.updated_at = new Date().toISOString();
    task.next_run_at = this.nextRun(task);
    await this.data.saveScheduledTask(task);
    return task;
  }

  async delete(id: string) {
    this.data.scheduledTasks.delete(id);
    if (this.data.databaseOnline) await this.data.pool.query("delete from scheduled_tasks where id = $1", [id]);
    return { ok: true, id };
  }

  async runNow(id: string) {
    const task = this.data.scheduledTasks.get(id);
    if (!task) throw new BadRequestException("Unknown task");
    return this.execute(task);
  }

  async runDueTasks(now = new Date()) {
    const due = [...this.data.scheduledTasks.values()].filter((task) => task.enabled && task.next_run_at && new Date(task.next_run_at) <= now);
    for (const task of due) await this.execute(task).catch(() => undefined);
  }

  private async execute(task: ScheduledTaskRecord) {
    if (this.running.has(task.id)) return task;
    this.running.add(task.id);
    task.last_status = "running";
    task.updated_at = new Date().toISOString();
    await this.data.saveScheduledTask(task);
    try {
      if (["start", "stop", "restart", "kill"].includes(task.action)) await this.services.power(task.service_id, task.action as "start" | "stop" | "restart" | "kill");
      if (task.action === "backup") await this.services.createBackup(task.service_id);
      if (task.action === "command") await this.services.command(task.service_id, task.command || "");
      task.last_status = "success";
      task.last_error = undefined;
      task.last_run_at = new Date().toISOString();
      task.next_run_at = this.nextRun(task, new Date(task.last_run_at));
    } catch (error) {
      task.last_status = "failed";
      task.last_error = error instanceof Error ? error.message : String(error);
      task.last_run_at = new Date().toISOString();
      task.next_run_at = this.nextRun(task, new Date(task.last_run_at));
    } finally {
      this.running.delete(task.id);
      task.updated_at = new Date().toISOString();
      await this.data.saveScheduledTask(task);
    }
    return task;
  }

  private nextRun(task: ScheduledTaskRecord, from = new Date()) {
    if (!task.enabled) return undefined;
    if (task.cadence === "manual") return task.run_at && new Date(task.run_at) > from ? new Date(task.run_at).toISOString() : undefined;
    if (task.cadence === "hourly") return new Date(from.getTime() + 60 * 60 * 1000).toISOString();
    if (task.cadence === "interval") return new Date(from.getTime() + Math.max(1, task.interval_minutes || 60) * 60 * 1000).toISOString();
    const [hours, minutes] = (task.time_of_day || "04:00").split(":").map((value) => Number(value));
    const next = new Date(from);
    next.setHours(Number.isFinite(hours) ? hours : 4, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    if (task.cadence === "daily") {
      if (next <= from) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    const day = Math.max(0, Math.min(6, task.day_of_week ?? 0));
    while (next <= from || next.getDay() !== day) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
}
