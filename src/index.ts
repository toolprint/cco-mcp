import app from "./app";
import logger from "./logger.js";

// Start the server
const PORT = 8660;
app.listen(PORT, () => {
  logger.info({ port: PORT }, "MCP Stateless Streamable HTTP Server started");
});
