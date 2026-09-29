import { Suspense } from "react";
import { redirect } from "next/navigation";

export default function ProjectIndex({ params }: PageProps<"/[ws]/p/[ident]">) {
  return (
    <Suspense>
      <Go params={params} />
    </Suspense>
  );
}

async function Go({ params }: { params: PageProps<"/[ws]/p/[ident]">["params"] }): Promise<null> {
  const { ws, ident } = await params;
  redirect(`/${ws}/p/${ident}/items` as never);
}
