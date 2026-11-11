// PROTOTYPE — throwaway. Answers "What should the in-app inbox look like in
// Cadence?" (wayfinder ticket #5). Three variants on every app page,
// switchable via ?variant=A|B|C. Add ?empty=1 to see the empty state.
// Fake, in-memory Notifications drawn from the first-version list (#3);
// nothing talks to Knock. A ≈ Knock's prebuilt popover; B and C would need
// Knock's headless hooks.
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Bell,
  CheckCheck,
  CircleDollarSign,
  Inbox,
  MessageSquare,
  MessageSquareReply,
  Receipt,
  TriangleAlert,
  Undo2,
  UsersRound,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

// ─── Fake data ───

type Kind =
  | "refund_request_raised"
  | "refund_request_decided"
  | "refund_issued"
  | "open_refund_request"
  | "refund_failed"
  | "comment_reply"
  | "new_comment"
  | "seat_claimed";

type FakeNotification = {
  id: number;
  kind: Kind;
  title: string;
  body: string;
  ago: string;
  today: boolean;
  read: boolean;
  href: string;
  cta: string;
  email: boolean; // also sent by email (per #3)
};

const KIND_ICON: Record<Kind, ReactNode> = {
  refund_request_raised: <Undo2 className="size-4" />,
  refund_request_decided: <Receipt className="size-4" />,
  refund_issued: <CircleDollarSign className="size-4" />,
  open_refund_request: <Receipt className="size-4" />,
  refund_failed: <TriangleAlert className="size-4" />,
  comment_reply: <MessageSquareReply className="size-4" />,
  new_comment: <MessageSquare className="size-4" />,
  seat_claimed: <UsersRound className="size-4" />,
};

const KIND_TONE: Record<Kind, string> = {
  refund_request_raised: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  refund_request_decided: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  refund_issued: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  open_refund_request: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  refund_failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  comment_reply: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  new_comment: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  seat_claimed: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

function fakeNotifications(
  role: UserRole | null,
  isTeamAdmin: boolean
): FakeNotification[] {
  let id = 0;
  const n = (x: Omit<FakeNotification, "id">) => ({ ...x, id: ++id });

  if (role === UserRole.Admin) {
    return [
      n({ kind: "refund_failed", title: "Refund Failed: Advanced TypeScript", body: "The payment provider declined Sam Lee's Refund of $49.00 to the card ending 0042. It needs attention.", ago: "4m", today: true, read: false, href: "/admin/refunds", cta: "Open Refund Requests", email: false }),
      n({ kind: "open_refund_request", title: "New Refund Request: React Patterns", body: "Jordan Park asked for a Refund: \"The course was not what I expected.\"", ago: "22m", today: true, read: false, href: "/admin/refunds", cta: "Decide Refund Request", email: false }),
      n({ kind: "open_refund_request", title: "New Refund Request: Team Licence · Node.js Fundamentals", body: "Acme Ltd (Team Admin: Riley Chen) asked for a Refund on a Team Licence with 0 Claimed Seats.", ago: "3h", today: true, read: true, href: "/admin/refunds", cta: "Decide Refund Request", email: false }),
      n({ kind: "comment_reply", title: "Alex Kim replied to your Comment", body: "\"Thanks, that fixed the build for me!\" in CSS Grid › Lesson 4", ago: "2d", today: false, read: true, href: "/courses", cta: "View Comment", email: false }),
    ];
  }

  if (role === UserRole.Instructor) {
    return [
      n({ kind: "new_comment", title: "New Comment on React Patterns", body: "Jordan Park on \"Compound components\": \"Why do we need context here instead of props?\"", ago: "9m", today: true, read: false, href: "/instructor/questions", cta: "Answer in Questions", email: false }),
      n({ kind: "new_comment", title: "New Comment on React Patterns", body: "Sam Lee on \"Render props\": \"Is this pattern still relevant with hooks?\"", ago: "1h", today: true, read: false, href: "/instructor/questions", cta: "Answer in Questions", email: false }),
      n({ kind: "comment_reply", title: "Jordan Park replied to your Comment", body: "\"Got it — makes sense now, thanks!\" on \"Compound components\"", ago: "5h", today: true, read: true, href: "/instructor/questions", cta: "View Comment", email: false }),
      n({ kind: "new_comment", title: "New Comment on Advanced TypeScript", body: "Alex Kim on \"Conditional types\": \"The infer example in 3:42 doesn't compile for me.\"", ago: "3d", today: false, read: true, href: "/instructor/questions", cta: "Answer in Questions", email: false }),
    ];
  }

  // Student (optionally a Team Admin)
  const list = [
    n({ kind: "refund_issued", title: "Your Refund has been sent", body: "$49.00 for Advanced TypeScript is on its way back to your card. It can take 5–10 days to appear.", ago: "12m", today: true, read: false, href: "/settings", cta: "View purchases", email: true }),
    n({ kind: "comment_reply", title: "Taylor Morgan replied to your Comment", body: "\"Use a key on the list item, not the wrapper.\" in React Patterns › Lists & keys", ago: "40m", today: true, read: false, href: "/courses", cta: "View reply", email: false }),
    n({ kind: "refund_request_decided", title: "Refund Request approved: Advanced TypeScript", body: "A Platform Admin approved your Refund Request. Your Enrollment has ended; your progress is kept.", ago: "1d", today: false, read: true, href: "/settings", cta: "View purchases", email: true }),
    n({ kind: "refund_request_raised", title: "Refund requested: Advanced TypeScript", body: "We've got your Refund Request. You keep your Enrollment while a Platform Admin reviews it.", ago: "3d", today: false, read: true, href: "/settings", cta: "View purchases", email: true }),
  ];
  if (isTeamAdmin) {
    list.splice(1, 0, n({ kind: "seat_claimed", title: "A Seat was claimed: Node.js Fundamentals", body: "Casey Nguyen claimed a Seat on your Team Licence. 7 of 10 Seats are now claimed.", ago: "25m", today: true, read: false, href: "/team", cta: "Open Team", email: false }));
  }
  return list;
}

function useFakeInbox(role: UserRole | null, isTeamAdmin: boolean) {
  const [searchParams] = useSearchParams();
  const empty = searchParams.get("empty") === "1";
  const seedKey = `${role}-${isTeamAdmin}-${empty}`;
  const [state, setState] = useState(() => ({
    seedKey,
    items: empty ? [] : fakeNotifications(role, isTeamAdmin),
  }));
  // Re-seed when the DevUI switches user (the layout doesn't remount).
  if (state.seedKey !== seedKey) {
    setState({ seedKey, items: empty ? [] : fakeNotifications(role, isTeamAdmin) });
  }
  const items = state.items;
  const setItems = (f: (xs: FakeNotification[]) => FakeNotification[]) =>
    setState((s) => ({ ...s, items: f(s.items) }));
  const unread = items.filter((i) => !i.read).length;
  return {
    items,
    unread,
    markRead: (id: number) =>
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: true } : x))),
    toggleRead: (id: number) =>
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: !x.read } : x))),
    markAllRead: () => setItems((xs) => xs.map((x) => ({ ...x, read: true }))),
  };
}
type FakeInbox = ReturnType<typeof useFakeInbox>;

function Badge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function KindIcon({ kind, size = "size-8" }: { kind: Kind; size?: string }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size,
        KIND_TONE[kind]
      )}
    >
      {KIND_ICON[kind]}
    </div>
  );
}

function EmptyState({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center text-muted-foreground",
        compact ? "py-10" : "h-full py-24"
      )}
    >
      <Inbox className="mb-3 size-8 opacity-50" />
      <div className="text-sm font-medium text-foreground">You're all caught up</div>
      <div className="mt-1 max-w-56 text-xs">
        Notifications about your Refunds, Comments and Seats will show up here.
      </div>
    </div>
  );
}

// ─── Variant A: bell in the sidebar header, compact popover ───

function VariantA({ inbox }: { inbox: FakeInbox }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        title="Notifications"
      >
        <Bell className="size-4" />
        <Badge count={inbox.unread} className="absolute -right-1 -top-1" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-full top-0 z-50 ml-3 w-96 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              {inbox.unread > 0 && (
                <button
                  onClick={inbox.markAllRead}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Mark all as read
                </button>
              )}
            </div>
            <div className="max-h-[28rem] overflow-y-auto">
              {inbox.items.length === 0 ? (
                <EmptyState compact />
              ) : (
                inbox.items.map((item) => (
                  <Link
                    key={item.id}
                    to={item.href}
                    onClick={() => {
                      inbox.markRead(item.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/60",
                      !item.read && "bg-primary/5"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        item.read ? "bg-transparent" : "bg-primary"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm", !item.read && "font-semibold")}>
                        {item.title}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {item.body}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {item.ago} ago
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Variant B: "Inbox" nav item, right-hand slide-over with tabs ───

function VariantBTrigger({ inbox, onOpen }: { inbox: FakeInbox; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Inbox className="size-4" />
      Inbox
      <Badge count={inbox.unread} className="ml-auto" />
    </button>
  );
}

function VariantBDrawer({ inbox, onClose }: { inbox: FakeInbox; onClose: () => void }) {
  const [tab, setTab] = useState<"unread" | "all">("all");
  const shown = tab === "unread" ? inbox.items.filter((i) => !i.read) : inbox.items;
  const groups = [
    { label: "Today", items: shown.filter((i) => i.today) },
    { label: "Earlier", items: shown.filter((i) => !i.today) },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-[26rem] flex-col border-l bg-background shadow-2xl">
        <div className="flex h-14 items-center justify-between border-b px-5">
          <span className="font-semibold">Inbox</span>
          <div className="flex items-center gap-1">
            <button
              onClick={inbox.markAllRead}
              disabled={inbox.unread === 0}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              title="Mark all as read"
            >
              <CheckCheck className="size-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-4 border-b px-5 text-sm">
          {(["all", "unread"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "-mb-px border-b-2 py-2.5 capitalize",
                tab === t
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
              {t === "unread" && inbox.unread > 0 && ` (${inbox.unread})`}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {groups.length === 0 ? (
            <EmptyState />
          ) : (
            groups.map((g) => (
              <div key={g.label} className="mb-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </div>
                <div className="space-y-2">
                  {g.items.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "rounded-lg border p-3",
                        !item.read && "border-primary/40 bg-primary/5"
                      )}
                    >
                      <div className="flex gap-3">
                        <KindIcon kind={item.kind} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className={cn("text-sm", !item.read && "font-semibold")}>
                              {item.title}
                            </div>
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {item.ago}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">{item.body}</div>
                          <div className="mt-2.5 flex items-center gap-3">
                            <Link
                              to={item.href}
                              onClick={() => {
                                inbox.markRead(item.id);
                                onClose();
                              }}
                              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                            >
                              {item.cta}
                            </Link>
                            <button
                              onClick={() => inbox.toggleRead(item.id)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Mark as {item.read ? "unread" : "read"}
                            </button>
                            {item.email && (
                              <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                                also emailed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Variant C: top bar bell, full inbox page with list + detail ───

function VariantCTopBar({ inbox, onOpen, open }: { inbox: FakeInbox; onOpen: () => void; open: boolean }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-end border-b bg-background/90 px-6 backdrop-blur">
      <button
        onClick={onOpen}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-muted",
          open && "bg-muted"
        )}
      >
        <Bell className="size-4" />
        {inbox.unread > 0 ? `${inbox.unread} new` : "Inbox"}
      </button>
    </div>
  );
}

function VariantCPage({ inbox, onClose }: { inbox: FakeInbox; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<number | null>(inbox.items[0]?.id ?? null);
  const selected = inbox.items.find((i) => i.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <div className="flex w-96 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h1 className="text-xl font-bold">Inbox</h1>
            <div className="text-xs text-muted-foreground">
              {inbox.unread} unread · {inbox.items.length} total
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={inbox.markAllRead}
              disabled={inbox.unread === 0}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              Mark all read
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Back to page"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {inbox.items.length === 0 ? (
            <EmptyState />
          ) : (
            inbox.items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  inbox.markRead(item.id);
                }}
                className={cn(
                  "flex w-full gap-3 border-b px-5 py-3 text-left hover:bg-muted/60",
                  selectedId === item.id && "bg-muted",
                  !item.read && "border-l-4 border-l-primary pl-4"
                )}
              >
                <KindIcon kind={item.kind} size="size-7" />
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-sm", !item.read && "font-semibold")}>
                    {item.title}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{item.body}</div>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{item.ago}</span>
              </button>
            ))
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-10">
        {selected ? (
          <div className="max-w-xl">
            <KindIcon kind={selected.kind} size="size-12" />
            <h2 className="mt-4 text-2xl font-bold">{selected.title}</h2>
            <div className="mt-1 text-sm text-muted-foreground">
              {selected.ago} ago{selected.email && " · also sent to your email"}
            </div>
            <p className="mt-6 leading-relaxed">{selected.body}</p>
            <div className="mt-8 flex items-center gap-4">
              <Link
                to={selected.href}
                onClick={onClose}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {selected.cta}
              </Link>
              <button
                onClick={() => inbox.toggleRead(selected.id)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Mark as {selected.read ? "unread" : "read"}
              </button>
            </div>
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

// ─── Wiring: hands slots to the layout and sidebar ───

const VARIANTS = [
  { key: "A", name: "Bell + popover" },
  { key: "B", name: "Inbox nav + slide-over" },
  { key: "C", name: "Top bar + inbox page" },
];

export function useNotificationInboxPrototype(
  role: UserRole | null,
  isTeamAdmin: boolean
) {
  const [searchParams] = useSearchParams();
  const variant = searchParams.get("variant") ?? "A";
  const inbox = useFakeInbox(role, isTeamAdmin);
  const [open, setOpen] = useState(false);

  return {
    variant,
    /** Next to the "Cadence" wordmark in the sidebar header. */
    sidebarHeader: variant === "A" ? <VariantA inbox={inbox} /> : null,
    /** Top of the sidebar nav. */
    sidebarNav:
      variant === "B" ? <VariantBTrigger inbox={inbox} onOpen={() => setOpen(true)} /> : null,
    /** Above <main>'s content. */
    mainTopBar:
      variant === "C" ? (
        <VariantCTopBar inbox={inbox} open={open} onOpen={() => setOpen((o) => !o)} />
      ) : null,
    /** Replaces <Outlet /> while the C inbox page is open. */
    mainOverride:
      variant === "C" && open ? <VariantCPage inbox={inbox} onClose={() => setOpen(false)} /> : null,
    overlay: (
      <>
        {variant === "B" && open && (
          <VariantBDrawer inbox={inbox} onClose={() => setOpen(false)} />
        )}
        <PrototypeSwitcher variants={VARIANTS} />
      </>
    ),
  };
}
