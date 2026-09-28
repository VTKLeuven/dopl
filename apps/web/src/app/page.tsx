import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/server/db";

async function DbCheck() {
  await connection();
  const rows = await db.$queryRaw<{ now: Date }[]>`SELECT now() as now`;
  const users = await db.user.count();
  return (
    <p>
      db ok: {rows[0]?.now.toISOString()} · users: {users}
    </p>
  );
}

export default function Page() {
  return (
    <main>
      <h1>Dopl</h1>
      <Suspense fallback={<p>checking…</p>}>
        <DbCheck />
      </Suspense>
    </main>
  );
}
