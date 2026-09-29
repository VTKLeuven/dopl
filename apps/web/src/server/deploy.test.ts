import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D-027 / ROADMAP §7 acceptance: the internet-facing web container never holds
 * Google (mailbox) credentials or the agent's SSH key. Checked on the
 * production compose file and the env templates, plus the web's own guard.
 */
const root = path.resolve(import.meta.dirname, "../../../..");
const read = (f: string) => readFile(path.join(root, f), "utf8");

/** The lines of one service block in docker/compose.prod.yml. */
function service(yaml: string, name: string): string {
  const lines = yaml.split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start < 0) throw new Error(`no service ${name}`);
  const end = lines.findIndex((l, i) => i > start && /^ {2}\S/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

const SECRET_VARS = [
  "GOOGLE_SERVICE_ACCOUNT_KEY_FILE",
  "GMAIL_PUBSUB_TOPIC",
  "GMAIL_PUBSUB_SUBSCRIPTION",
  "AGENT_SSH_KEY_FILE",
  "HERMES_API_KEY",
  "WARPGATE_HOST_KEY",
];

describe("web never holds worker secrets (D-027)", () => {
  it("mounts secrets and worker.env into the worker only", async () => {
    const compose = await read("docker/compose.prod.yml");
    const web = service(compose, "web");
    const worker = service(compose, "worker");
    expect(web).not.toMatch(/secrets|worker\.env|volumes:|GOOGLE|GMAIL|SSH/i);
    expect(worker).toMatch(/\.\/secrets:\/run\/secrets:ro/);
    expect(worker).toMatch(/worker\.env/);
  });

  it("keeps the secret settings out of the shared .env", async () => {
    const shared = await read(".env.example");
    const workerOnly = await read("worker.env.example");
    for (const v of SECRET_VARS) {
      expect(shared).not.toMatch(new RegExp(`^${v}=`, "m"));
      expect(workerOnly).toMatch(new RegExp(`^${v}=`, "m"));
    }
    expect(await read(".gitignore")).toMatch(/^worker\.env$/m);
  });

  it("refuses to start the web app with a worker secret in its env", async () => {
    const before = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = "/run/secrets/google-sa.json";
    try {
      await expect(import(`./env?check=${Date.now()}`)).rejects.toThrow(/worker\.env/);
    } finally {
      if (before === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
      else process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE = before;
    }
  });
});

describe("docker/Dockerfile", () => {
  it("installs every workspace package (its manifest is copied before pnpm install)", async () => {
    const dockerfile = await read("docker/Dockerfile");
    for (const dir of ["apps", "packages"]) {
      for (const name of await readdir(path.join(root, dir))) {
        const manifest = `${dir}/${name}/package.json`;
        const exists = await read(manifest).then(
          () => true,
          () => false,
        );
        if (exists) expect(dockerfile).toContain(`COPY ${manifest} ${dir}/${name}/`);
      }
    }
  });
});
