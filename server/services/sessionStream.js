import { subscribeToSession } from "../orchestration/eventBus.js";

/**
 * Shared SSE handler so the demo and classroom routes stream the same session
 * events. The caller resolves and authorises the session first.
 */
export function openSessionEventStream(req, res, session) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write("retry: 3000\n\n");
  res.write(
    `event: snapshot\ndata: ${JSON.stringify({
      sessionId: session.id,
      sessionStatus: session.status,
      events: [...session.events].sort((a, b) => new Date(a.at) - new Date(b.at)),
    })}\n\n`,
  );

  const unsubscribe = subscribeToSession(session.id, (event) => {
    res.write(`event: agent-event\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
}
