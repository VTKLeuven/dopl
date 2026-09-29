"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, Paperclip, SendHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { newClientId, useSendMessage } from "./data";
import { useChatSources } from "./editor-sources";
import { useTypingPing } from "./typing";
import type { MessageView, Person } from "./types";

const MAX = 25 * 1024 * 1024;

interface Upload {
  key: string;
  name: string;
  attachment: MessageView["attachments"][number] | null;
}

/**
 * Chat composer: the shared Tiptap editor with @mentions and #item refs.
 * Enter sends, Shift+Enter adds a line. Files can be attached, pasted or
 * dropped; they upload right away and are claimed when the message is sent.
 */
export function Composer({
  ws,
  channelId,
  threadRootId,
  people,
  me,
  placeholder,
  autoFocus,
  onSent,
}: {
  ws: string;
  channelId: string;
  threadRootId: string | null;
  people: Person[];
  me: Person | null;
  placeholder: string;
  autoFocus?: boolean;
  onSent?: () => void;
}) {
  const t = useTranslations("messages");
  const sources = useChatSources(ws, people);
  const send = useSendMessage(ws, me);
  const typing = useTypingPing(ws, channelId, threadRootId);
  const [doc, setDoc] = useState<unknown>(null);
  const [empty, setEmpty] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploading = uploads.some((u) => !u.attachment);

  async function upload(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (file.size > MAX) {
        toast.error(t("tooLarge", { name: file.name }));
        continue;
      }
      const key = newClientId();
      setUploads((u) => [...u, { key, name: file.name, attachment: null }]);
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/v1/${ws}/messages/attachments`, { method: "POST", body });
      if (!res.ok) {
        toast.error(t("uploadFailed", { name: file.name }));
        setUploads((u) => u.filter((x) => x.key !== key));
        continue;
      }
      const attachment = (await res.json()) as Upload["attachment"];
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, attachment } : x)));
    }
  }

  const submit = () => {
    const ready = uploads.flatMap((u) => (u.attachment ? [u.attachment] : []));
    if (uploading) {
      toast(t("waitForUploads"));
      return;
    }
    if (empty && ready.length === 0) return;
    send.mutate({
      clientId: newClientId(),
      channelId,
      threadRootId,
      body: empty ? { type: "doc", content: [{ type: "paragraph" }] } : doc,
      attachments: ready,
    });
    setDoc(null);
    setEmpty(true);
    setUploads([]);
    setEditorKey((k) => k + 1);
    typing.stop();
    onSent?.();
  };

  return (
    <div
      className={cn(
        "rounded-card border border-border-strong bg-surface px-3 pt-2 pb-1.5 shadow-xs transition-colors",
        "focus-within:border-focus focus-within:ring-[3px] focus-within:ring-sky-400/30",
        dragging && "border-sky-300 bg-sky-50",
      )}
      data-testid={threadRootId ? "thread-composer" : "composer"}
      onPaste={(e) => {
        if (e.clipboardData.files.length > 0) {
          e.preventDefault();
          void upload(e.clipboardData.files);
        }
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <RichTextEditor
        key={editorKey}
        value={null}
        onChange={(next, editor) => {
          setDoc(next);
          setEmpty(editor.isEmpty);
          if (editor.isEmpty) typing.stop();
          else typing.typing();
        }}
        onSubmit={submit}
        submitOnEnter
        placeholder={placeholder}
        sources={sources}
        autoFocus={autoFocus}
        minHeight="min-h-[22px] max-h-[40vh] overflow-y-auto scrollbar-thin"
      />
      {uploads.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {uploads.map((u) => (
            <li
              key={u.key}
              className="inline-flex h-7 max-w-[240px] items-center gap-1.5 rounded-chip border border-border bg-surface-muted pr-1 pl-2 text-small"
            >
              {u.attachment ? <FileText className="size-3.5 text-icon" /> : <Spinner size={12} />}
              <span className="truncate">{u.name}</span>
              <button
                type="button"
                aria-label={t("removeFile", { name: u.name })}
                className="inline-flex size-5 items-center justify-center rounded-[5px] text-icon hover:bg-neutral-150 hover:text-fg"
                onClick={() => setUploads((x) => x.filter((y) => y.key !== u.key))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1 flex items-center gap-1">
        <Tooltip content={t("attach")}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t("attach")}
            onClick={() => input.current?.click()}
          >
            <Paperclip />
          </Button>
        </Tooltip>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          data-testid="composer-file"
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="ml-auto hidden text-caption text-fg-muted sm:block">{t("enterHint")}</span>
        <Tooltip content={t("send")} shortcut="enter">
          <Button
            size="icon-xs"
            variant="primary"
            aria-label={t("send")}
            data-testid="composer-send"
            disabled={empty && uploads.length === 0}
            onClick={submit}
          >
            <SendHorizontal />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
