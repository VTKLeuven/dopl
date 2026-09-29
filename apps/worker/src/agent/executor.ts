import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Client } from "ssh2";

export interface ExecResult {
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  killed: boolean;
}

export interface Executor {
  run(opts: {
    /** Warpgate target name (AgentHost.warpgateTarget). */
    target: string;
    command: string;
    onData: (chunk: string) => void;
    signal: AbortSignal;
    timeoutMs: number;
  }): Promise<ExecResult>;
}

/**
 * Commands run over SSH through Warpgate, which records the session (D-031):
 * user `dopl-agent:<target>`, a dedicated key that only the worker holds
 * (D-027), and Warpgate's host key pinned by its SHA-256 fingerprint.
 */
export class WarpgateExecutor implements Executor {
  private readonly key: Buffer;

  constructor(
    private readonly cfg: {
      host: string;
      port: number;
      user: string;
      keyFile: string;
      /** "SHA256:<base64>" as `ssh-keygen -lf` prints it. */
      hostKeyFingerprint: string;
    },
  ) {
    this.key = readFileSync(cfg.keyFile);
  }

  run(opts: Parameters<Executor["run"]>[0]): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let settled = false;
      let timedOut = false;
      let killed = false;
      const done = (r: ExecResult | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opts.signal.removeEventListener("abort", onAbort);
        conn.end();
        if (r instanceof Error) reject(r);
        else resolve(r);
      };
      const kill = () => {
        conn.end();
        conn.destroy();
      };
      const onAbort = () => {
        killed = true;
        kill();
        done({ exitCode: null, signal: "KILL", timedOut: false, killed: true });
      };
      const timer = setTimeout(() => {
        timedOut = true;
        kill();
        done({ exitCode: null, signal: "KILL", timedOut: true, killed: false });
      }, opts.timeoutMs);
      opts.signal.addEventListener("abort", onAbort, { once: true });

      conn
        .on("ready", () => {
          conn.exec(opts.command, (err, stream) => {
            if (err) return done(err);
            stream
              .on("close", (code: number | null, signal: string | null) =>
                done({ exitCode: code ?? null, signal: signal ?? null, timedOut, killed }),
              )
              .on("data", (d: Buffer) => opts.onData(d.toString("utf8")))
              .stderr.on("data", (d: Buffer) => opts.onData(d.toString("utf8")));
          });
        })
        .on("error", (err) => done(err))
        .connect({
          host: this.cfg.host,
          port: this.cfg.port,
          username: `${this.cfg.user}:${opts.target}`,
          privateKey: this.key,
          readyTimeout: 15_000,
          keepaliveInterval: 15_000,
          hostVerifier: (key: Buffer) =>
            `SHA256:${createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}` ===
            this.cfg.hostKeyFingerprint.replace(/=+$/, ""),
        });
    });
  }
}

const CANNED: Array<[RegExp, string]> = [
  [/^uptime$/, " 14:02:11 up 41 days,  3:12,  0 users,  load average: 0.12, 0.09, 0.05\n"],
  [/^hostname$/, "lab-01\n"],
  [/^whoami$/, "dopl-agent\n"],
  [
    /^docker ps\b/,
    "CONTAINER ID   IMAGE          STATUS        PORTS                  NAMES\n3f2a91c0d1e2   nginx:1.29     Up 12 days    0.0.0.0:8080->80/tcp   web\n8b7c6d5e4f3a   postgres:17    Up 12 days    5432/tcp               db\n",
  ],
  [
    /^df -h\b/,
    "Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1        98G   41G   53G  44% /\n",
  ],
  [/^cat \.env$/, "POSTGRES_PASSWORD=hunter22\nAPI_KEY=sk-abcdefghijklmnopqrstuvwx\n"],
];

/**
 * Development and tests only: no network, canned output for a few common
 * commands, `sleep N` really waits (to test Stop), and `false`/`exit N`
 * fail. Refused in production (env.ts).
 */
export class FakeExecutor implements Executor {
  async run(opts: Parameters<Executor["run"]>[0]): Promise<ExecResult> {
    const cmd = opts.command.trim();
    const sleep = cmd.match(/^sleep (\d+(?:\.\d+)?)$/);
    if (sleep) {
      const ms = Number(sleep[1]) * 1000;
      const outcome = await new Promise<"done" | "timeout" | "killed">((resolve) => {
        const t = setTimeout(() => resolve("done"), ms);
        const to = setTimeout(() => resolve("timeout"), opts.timeoutMs);
        opts.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            clearTimeout(to);
            resolve("killed");
          },
          { once: true },
        );
      });
      return {
        exitCode: outcome === "done" ? 0 : null,
        signal: outcome === "done" ? null : "KILL",
        timedOut: outcome === "timeout",
        killed: outcome === "killed",
      };
    }
    const exit = cmd.match(/^(?:false|exit (\d+))$/);
    if (exit) {
      opts.onData("");
      return { exitCode: exit[1] ? Number(exit[1]) : 1, signal: null, timedOut: false, killed: false };
    }
    const canned = CANNED.find(([re]) => re.test(cmd));
    opts.onData(canned ? canned[1] : `[fake executor on ${opts.target}] ${cmd}\n`);
    return { exitCode: 0, signal: null, timedOut: false, killed: false };
  }
}
