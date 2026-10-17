import type { Block, FileChangeItem } from "../types";

function blocksFromEvents(events: any[]): Block[] {
  const blocks: Block[] = [];
  const index = new Map<string, number>();
  for (const ev of events) {
    switch (ev.type) {
      case "turn_started":
        blocks.push({ kind: "prompt", text: ev.prompt, ts: ev.ts, checkpoint: ev.checkpoint });
        break;
      case "plan":
        index.set(ev.id, blocks.length);
        blocks.push({ kind: "plan", id: ev.id, items: ev.items });
        break;
      case "command":
        index.set(ev.id, blocks.length);
        blocks.push({ kind: "command", id: ev.id, cmd: ev.cmd, status: ev.status, reason: ev.reason });
        break;
      case "file_change":
        blocks.push({ kind: "file_change", path: ev.path, additions: ev.additions, deletions: ev.deletions, patch: ev.patch, reverted: ev.reverted });
        break;
      case "preview_ready":
        blocks.push({ kind: "preview", path: ev.path, url: ev.url });
        break;
      case "process":
        blocks.push({ kind: "process", id: ev.id, cmd: ev.cmd, pid: ev.pid });
        break;
      case "source":
        blocks.push({ kind: "source", url: ev.url, title: ev.title });
        break;
      case "subagent":
        blocks.push({ kind: "subagent", id: ev.id, prompt: ev.prompt, done: !!ev.done });
        break;
      case "steer":
        blocks.push({ kind: "prompt", text: ev.prompt, ts: ev.ts });
        break;
      case "restored":
        blocks.push({ kind: "error", message: `已回退到 checkpoint ${ev.hash}` });
        break;
      case "annotation":
        blocks.push({ kind: "annotation", quote: ev.quote, note: ev.note });
        break;
      case "cloud_pc":
        blocks.push({ kind: "cloud_pc", state: ev.state });
        break;
      case "swarm_started":
        blocks.push({ kind: "swarm", id: ev.id, task: ev.task, agents: ev.agents, done: false });
        break;
      case "agent_message":
        index.set(ev.id, blocks.length);
        blocks.push({ kind: "agent_message", id: ev.id, text: ev.content || "", done: !!ev.done, feedback: ev.feedback, ts: ev.ts });
        break;
      default:
        break;
    }
  }
  for (const ev of events) {
    if (ev.type === "command_result") {
      const i = index.get(ev.id);
      if (i !== undefined && blocks[i].kind === "command") {
        Object.assign(blocks[i] as any, { status: ev.status, output: ev.output, code: ev.code, durationMs: ev.durationMs });
      }
    }
  }
  return blocks;
}

function groupBlocks(blocks: Block[]): Block[] {
  const out: Block[] = [];
  let group: FileChangeItem[] = [];
  const flush = () => {
    if (group.length === 1) out.push({ kind: "file_change", ...group[0] });
    else if (group.length > 1) out.push({ kind: "file_group", items: group });
    group = [];
  };
  for (const b of blocks) {
    if (b.kind === "file_change") group.push({ path: b.path, additions: b.additions, deletions: b.deletions, patch: b.patch, reverted: b.reverted });
    else {
      flush();
      out.push(b);
    }
  }
  flush();
  return out;
}

export { blocksFromEvents, groupBlocks };
