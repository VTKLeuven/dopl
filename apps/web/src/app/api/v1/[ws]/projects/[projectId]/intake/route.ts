import { IntakeTabSchema } from "@dopl/shared/schemas/intake";
import { api } from "@/server/api";
import { countIntake, listIntake } from "@/server/queries/intake";
import { projectAccessById } from "@/server/queries/projects";

export async function GET(
  req: Request,
  { params }: RouteContext<"/api/v1/[ws]/projects/[projectId]/intake">,
) {
  const { ws, projectId } = await params;
  const tab = IntakeTabSchema.catch("pending").parse(new URL(req.url).searchParams.get("tab"));
  return api(ws, async (ctx) => {
    const access = await projectAccessById(ctx, projectId);
    const [rows, counts] = await Promise.all([listIntake(access, tab), countIntake(access)]);
    return { rows, counts };
  });
}
