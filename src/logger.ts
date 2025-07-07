import pino from "pino";

const logger = pino({
  name: "cco-mcp",
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
            singleLine: true,
          },
        }
      : undefined,
});

export default logger;
