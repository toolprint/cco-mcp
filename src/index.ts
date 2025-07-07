import app from "./app";
import logger from "./logger.js";

// Start the server
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8660;
const HOST = '0.0.0.0'; // Listen on all interfaces for Cloud Run

app.listen(PORT, HOST, () => {
  logger.info({ port: PORT, host: HOST }, "MCP Stateless Streamable HTTP Server started");
});
