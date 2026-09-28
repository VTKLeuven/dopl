import pino from "pino";
import { env } from "./env";

export const logger = pino({
  name: "dopl-worker",
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } } }
    : {}),
});
