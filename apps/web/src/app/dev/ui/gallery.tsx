"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpDown,
  Bell,
  ChevronDown,
  Columns3,
  Copy,
  Inbox,
  LayoutList,
  Link,
  ListFilter,
  Plus,
  Search,
  Table,
  Trash,
  CalendarDays,
  ChartGantt,
  Archive,
} from "lucide-react";
import { tagColors } from "@dopl/shared/palette";
import { Button } from "@/components/ui/button";
import { Kbd, Shortcut } from "@/components/ui/kbd";
import { Tooltip } from "@/components/ui/tooltip";
import { Input, Textarea, Label, FieldHint, FieldError } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Avatar, AgentAvatar, AvatarStack } from "@/components/ui/avatar";
import { Tag, TagDot, Overflow } from "@/components/ui/tag";
import { Chip } from "@/components/ui/chip";
import { Banner } from "@/components/ui/banner";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StateIcon, type StateGroup } from "@/components/icons/state-icon";
import { PriorityIcon, type Priority } from "@/components/icons/priority-icon";
import { DoplLogo } from "@/components/icons/dopl-logo";
import { Section, Row, Swatch } from "./section";

const people = [
  { id: "0190a1b2-0000-7000-8000-000000000001", name: "Ann Peeters" },
  { id: "0190a1b2-0000-7000-8000-000000000002", name: "Bram Janssens" },
  { id: "0190a1b2-0000-7000-8000-000000000003", name: "Chloé Maes" },
  { id: "0190a1b2-0000-7000-8000-000000000004", name: "Dries Claes" },
  { id: "0190a1b2-0000-7000-8000-000000000005", name: "Emma Wouters" },
];
const groups: StateGroup[] = ["TRIAGE", "BACKLOG", "UNSTARTED", "STARTED", "COMPLETED", "CANCELLED"];
const priorities: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW", "NONE"];

export function Gallery() {
  const [layout, setLayout] = useState("list");
  const [checked, setChecked] = useState(true);
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="min-h-full bg-canvas p-2">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-panel border border-border bg-surface">
        <header className="flex h-14 items-center justify-between border-b border-border px-8">
          <DoplLogo />
          <span className="text-small text-fg-muted">UI gallery · every component, every state</span>
        </header>

        <Section title="Neutrals & surfaces">
          <Row>
            {["0", "50", "100", "150", "200", "250", "300", "400", "500", "600", "700", "800", "900", "950"].map((s) => (
              <Swatch key={s} name={`neutral-${s}`} varName={`--color-neutral-${s}`} />
            ))}
          </Row>
        </Section>

        <Section title="Accents">
          {(["sky", "lavender"] as const).map((hue) => (
            <Row key={hue}>
              {["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"].map((s) => (
                <Swatch key={s} name={`${hue}-${s}`} varName={`--color-${hue}-${s}`} />
              ))}
            </Row>
          ))}
          <Row>
            <div className="h-10 w-64 rounded-chip bg-brand-gradient" />
            <span className="text-small text-fg-muted">Brand gradient — logo, AI teammate, 1–2 hero moments only</span>
          </Row>
        </Section>

        <Section title="Typography">
          <p className="text-display font-semibold">Display — INFRA-42 Move web container to 8081</p>
          <p className="text-title-lg font-semibold">Title large — Peek panel title</p>
          <p className="text-title font-semibold">Title — Dialog title</p>
          <p className="text-nav font-medium">Nav — Sidebar item, breadcrumb</p>
          <p className="text-body">Body — The default text size for tables and descriptions.</p>
          <p className="text-body font-medium">Body strong — Names and column headers</p>
          <p className="text-small text-fg-secondary">Small — Secondary cells, chips, pills</p>
          <p className="text-caption text-fg-muted">Caption — Section labels, timestamps</p>
          <p className="tabular text-body">Tabular: 0123456789 · INFRA-1024 · 12 Mar 2026</p>
          <p className="font-mono text-small">Mono — docker compose up -d --remove-orphans</p>
        </Section>

        <Section title="Buttons">
          <Row label="Variants">
            <Button variant="primary"><Plus />New item</Button>
            <Button variant="secondary">View settings<ChevronDown /></Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger"><Trash />Delete</Button>
            <Button variant="danger-ghost">Remove</Button>
            <Button variant="link">Link button</Button>
          </Row>
          <Row label="Sizes">
            <Button variant="primary" size="lg">Large</Button>
            <Button variant="primary" size="md">Medium</Button>
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="xs">Extra small</Button>
          </Row>
          <Row label="Icon only">
            <Button size="icon-lg" aria-label="Notifications"><Bell /></Button>
            <Button size="icon" aria-label="Notifications"><Bell /></Button>
            <Button size="icon-sm" variant="ghost" aria-label="Notifications"><Bell /></Button>
            <Button size="icon-xs" variant="ghost" aria-label="Notifications"><Bell /></Button>
          </Row>
          <Row label="States">
            <Button variant="primary" loading>Saving</Button>
            <Button variant="secondary" loading>Loading</Button>
            <Button variant="primary" disabled>Disabled</Button>
            <Button variant="secondary" disabled>Disabled</Button>
          </Row>
        </Section>

        <Section title="Keyboard & tooltips">
          <Row>
            <Kbd>C</Kbd>
            <Shortcut keys="mod+k" />
            <Shortcut keys="g i" />
            <Shortcut keys="mod+shift+enter" />
            <Tooltip content="Create item" shortcut="c"><Button variant="primary" size="sm"><Plus />New</Button></Tooltip>
            <Tooltip content="Copy link" shortcut="mod+shift+,"><Button size="icon-sm" variant="ghost" aria-label="Copy link"><Link /></Button></Tooltip>
          </Row>
        </Section>

        <Section title="Inputs">
          <div className="grid max-w-3xl grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d1">Title</Label>
              <Input id="d1" placeholder="Short summary of the work" />
              <FieldHint>Keep it under 80 characters.</FieldHint>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d2">Identifier</Label>
              <Input id="d2" defaultValue="INF" aria-invalid />
              <FieldError>Use 2–10 letters or digits, starting with a letter.</FieldError>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d3">Disabled</Label>
              <Input id="d3" disabled defaultValue="Can't touch this" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d4">With icon</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon" />
                <Input id="d4" className="pl-9" placeholder="Search items, keywords, notes…" />
              </div>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="d5">Description</Label>
              <Textarea id="d5" placeholder="Add a description…" />
            </div>
          </div>
        </Section>

        <Section title="Selection controls">
          <Row label="Checkbox">
            <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} aria-label="Checked" />
            <Checkbox checked={false} aria-label="Unchecked" />
            <Checkbox checked="indeterminate" aria-label="Indeterminate" />
            <Checkbox disabled aria-label="Disabled" />
          </Row>
          <Row label="Switch">
            <Switch defaultChecked aria-label="On" />
            <Switch aria-label="Off" />
            <Switch disabled aria-label="Disabled" />
          </Row>
          <Row label="Segmented">
            <SegmentedControl value={layout} onValueChange={setLayout} label="Layout">
              <SegmentedControlItem value="list" aria-label="List"><LayoutList /></SegmentedControlItem>
              <SegmentedControlItem value="board" aria-label="Board"><Columns3 /></SegmentedControlItem>
              <SegmentedControlItem value="calendar" aria-label="Calendar"><CalendarDays /></SegmentedControlItem>
              <SegmentedControlItem value="table" aria-label="Table"><Table /></SegmentedControlItem>
              <SegmentedControlItem value="timeline" aria-label="Timeline"><ChartGantt /></SegmentedControlItem>
            </SegmentedControl>
          </Row>
          <Row label="Tabs">
            <Tabs defaultValue="activity">
              <TabsList>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="comments">Comments</TabsTrigger>
                <TabsTrigger value="agent">Agent runs</TabsTrigger>
              </TabsList>
            </Tabs>
          </Row>
        </Section>

        <Section title="Toolbar chips">
          <Row>
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-icon" />
              <Input className="h-8 pl-9" placeholder="Search items…" />
            </div>
            <Chip><ArrowUpDown />Sorted by <span className="font-medium text-fg">Updated</span></Chip>
            <Chip><ListFilter />Filters</Chip>
            <Chip active><ListFilter />Filters · 2</Chip>
            <Chip active={!showDone} onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Showing done" : "Done hidden · 23"}
            </Chip>
          </Row>
        </Section>

        <Section title="Menus, popovers, dialogs">
          <Row>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button>Actions<ChevronDown /></Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Work item</DropdownMenuLabel>
                <DropdownMenuItem shortcut="mod+shift+,"><Link />Copy link</DropdownMenuItem>
                <DropdownMenuItem shortcut="mod+."><Copy />Copy identifier</DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><Inbox />Move to project</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem>INFRA · Infrastructure</DropdownMenuItem>
                    <DropdownMenuItem>NET · Network</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuCheckboxItem checked>Subscribed</DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem><Archive />Archive</DropdownMenuItem>
                <DropdownMenuItem destructive shortcut="mod+backspace"><Trash />Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover>
              <PopoverTrigger asChild><Button>Popover</Button></PopoverTrigger>
              <PopoverContent className="w-72 p-4">
                <p className="text-body font-medium">Display options</p>
                <p className="mt-1 text-small text-fg-muted">Popovers: white, 1px border, very soft shadow.</p>
              </PopoverContent>
            </Popover>
            <Dialog>
              <DialogTrigger asChild><Button>Dialog</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete project?</DialogTitle>
                  <DialogDescription>This removes 124 work items. You can restore them for 30 days.</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <Input placeholder="Type INFRA to confirm" />
                </DialogBody>
                <DialogFooter>
                  <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                  <Button variant="danger">Delete project</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Row>
        </Section>

        <Section title="Avatars">
          <Row label="Sizes">
            <Avatar user={people[0]!} size="xs" />
            <Avatar user={people[0]!} size="sm" />
            <Avatar user={people[0]!} size="md" />
            <Avatar user={people[0]!} size="lg" />
          </Row>
          <Row label="Stack">
            <AvatarStack users={people} />
          </Row>
          <Row label="AI teammate">
            <AgentAvatar size="md" />
            <AgentAvatar size="md" working />
            <AgentAvatar size="lg" working />
            <span className="text-small text-fg-muted">idle · working (rotating gradient ring)</span>
          </Row>
        </Section>

        <Section title="Labels & tags">
          <Row>
            {tagColors.map((c) => (
              <Tag key={c} color={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</Tag>
            ))}
          </Row>
          <Row>
            <Tag color="purple">M&amp;A Analysis</Tag>
            <Tag color="red">Risk Analysis</Tag>
            <Overflow count={8} />
            <Tag color="teal" onRemove={() => undefined}>Removable</Tag>
            {tagColors.map((c) => <TagDot key={c} color={c} />)}
          </Row>
        </Section>

        <Section title="States & priorities">
          <Row label="State groups">
            {groups.map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5 text-body">
                <StateIcon group={g} />
                {g.charAt(0) + g.slice(1).toLowerCase()}
              </span>
            ))}
          </Row>
          <Row label="Started %">
            {[0.15, 0.35, 0.5, 0.75, 0.95].map((p) => <StateIcon key={p} group="STARTED" progress={p} />)}
          </Row>
          <Row label="Priorities">
            {priorities.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5 text-body">
                <PriorityIcon priority={p} />
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </span>
            ))}
          </Row>
          <Row label="Progress">
            <ProgressRing value={0} total={4} />
            <ProgressRing value={1} total={4} />
            <ProgressRing value={3} total={4} />
            <ProgressRing value={4} total={4} />
            <Spinner />
          </Row>
        </Section>

        <Section title="Banners">
          <Banner title="Remote images are blocked">Load them only if you trust the sender.</Banner>
          <Banner tone="warning" title="Untrusted input">This run read content from an email — every action needs approval.</Banner>
          <Banner tone="danger" title="Agent paused" action={<Button size="xs">Resume</Button>}>No new runs will start until an admin resumes the agent.</Banner>
          <Banner tone="success" title="Mailbox connected">Backfilling the last 90 days.</Banner>
        </Section>

        <Section title="Skeletons">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-[52px] items-center gap-3 border-b border-border">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3.5 w-80" />
              <Skeleton className="ml-auto h-6 w-20 rounded-chip" />
              <Skeleton className="size-6 rounded-full" />
            </div>
          ))}
        </Section>

        <Section title="Empty & error states">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-card border border-border">
              <EmptyState
                icon={<Inbox />}
                title="Inbox zero"
                description="Mentions, assignments and approvals will show up here."
              />
            </div>
            <div className="rounded-card border border-border">
              <EmptyState
                icon={<ListFilter />}
                title="No items match these filters"
                description="Try removing a filter or showing done items."
                action={<Button size="sm">Clear filters</Button>}
              />
            </div>
          </div>
        </Section>

        <Section title="Toasts">
          <Row>
            <Button onClick={() => toast("Priority changed to High")}>Info toast</Button>
            <Button onClick={() => toast.success("Item created", { description: "INFRA-128 · Rotate TLS certs" })}>Success</Button>
            <Button onClick={() => toast.error("Couldn't save", { action: { label: "Retry", onClick: () => undefined } })}>Error with retry</Button>
            <Button onClick={() => toast("3 items deleted", { action: { label: "Undo", onClick: () => undefined } })}>Undo toast</Button>
          </Row>
        </Section>
      </div>
    </div>
  );
}
