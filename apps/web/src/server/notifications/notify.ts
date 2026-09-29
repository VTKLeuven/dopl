import "server-only";

/* notify() lives in @dopl/server so worker jobs (new email) use the same rules. */
export { notify, type NotifyContext, type NotifyInput } from "@dopl/server/notify";
