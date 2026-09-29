import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildMcpServer } from "@/server/agent/mcp";
import { authenticateMcp } from "@/server/agent/mcp-auth";

/**
 * Dopl's MCP server for the AI teammate (D-032): Streamable HTTP in
 * stateless mode, one server per request. Hermes authenticates with an MCP
 * token; every tool also takes the run's `run_token`.
 */
async function handle(req: Request): Promise<Response> {
  const principal = await authenticateMcp(req.headers.get("authorization"));
  if (!principal)
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="dopl-mcp"' } },
    );
  const server = buildMcpServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(req);
  // Long tool calls stream progress over SSE; tell proxies not to buffer it.
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");
  return new Response(response.body, { status: response.status, headers });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
