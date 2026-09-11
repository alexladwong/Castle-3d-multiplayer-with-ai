"use client";
// src/app/dev/ui-kit/gallery.tsx  [U0]
// Every ui-kit primitive on one screen, with real data (personas from
// src/lib/difficulty.ts, rooms from src/lib/rooms.ts, positions from the Opera
// Game) so U1-U5 and a human can review the system without signing in.
import { useState } from "react";
import {
  BoxIcon,
  CameraIcon,
  DownloadIcon,
  FlagIcon,
  HandshakeIcon,
  KeyboardIcon,
  LightbulbIcon,
  MaximizeIcon,
  RotateCcwIcon,
  SofaIcon,
  Undo2Icon,
} from "lucide-react";
import {
  ActionBar,
  ActionButton,
  ActionGroup,
  ActionSeparator,
  ChatList,
  ChatMessage,
  Display,
  Eyebrow,
  FocusHud,
  Kbd,
  MiniBoard,
  MoveList,
  PlayerChip,
  Podium,
  Reveal,
  RoomCard,
  Section,
  ShortcutsDialog,
  StatPill,
  type Shortcut,
} from "@/components/ui-kit";
import { ThemeToggle } from "@/components/nav/theme-toggle";
import { Button } from "@/components/ui/button";
import { toHistoryRows } from "@/lib/chess";
import { ROOMS, ROOM_ORDER } from "@/lib/rooms";
import type { RoomPresetId } from "@/lib/types";

/** UI_REDESIGN §1.4 — the Opera Game, Paris 1858. Public domain. */
const OPERA_SAN =
  "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(
    " ",
  );
/** After 11…Nbd7 (ply 22). */
const MIDGAME_FEN = "r3kb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/R3K2R w KQkq - 1 12";
/** After 17. Rd8# — the final position. */
const MATE_FEN = "1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17";
const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** One short, in-character line per persona (§3, under 90 characters each). */
const SAMPLE_LINES: Record<string, string> = {
  pip: "Ooh, e4 already? I always forget that one. Good luck — I'll try my best.",
  marco: "The Sicilian! My uncle played this. He lost, but he lost beautifully.",
  ada: "That knight has no squares. Trade it off before it becomes a spectator.",
  viktor: "Solid. Now I take the open file and you spend ten moves regretting it.",
  kasparova: "You had one good move this game. That was not it.",
};

const SHORTCUTS: Shortcut[] = [
  { group: "Board", keys: ["T"], label: "Switch between 2D and 3D" },
  { group: "Board", keys: ["R"], label: "Flip the board" },
  { group: "Board", keys: ["F"], label: "Enter or leave fullscreen" },
  { group: "Review", keys: ["←"], label: "Previous move" },
  { group: "Review", keys: ["→"], label: "Next move" },
  { group: "Review", keys: ["Home"], label: "First move" },
  { group: "Review", keys: ["End"], label: "Back to live" },
  { group: "Help", keys: ["?"], label: "Show this dialog" },
];

const TOKENS: { name: string; className: string; text?: string }[] = [
  { name: "--bg", className: "bg-bg" },
  { name: "--bg-elevated", className: "bg-bg-elevated" },
  { name: "--bg-sunken", className: "bg-bg-sunken" },
  { name: "--fg", className: "bg-fg" },
  { name: "--fg-muted", className: "bg-fg-muted" },
  { name: "--line", className: "bg-line" },
  { name: "--accent", className: "bg-brass" },
  { name: "--live", className: "bg-live" },
  { name: "--danger", className: "bg-danger" },
  { name: "--board-light", className: "bg-board-light" },
  { name: "--board-dark", className: "bg-board-dark" },
];

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  // The slug id makes every band linkable — handy for review and for QA deep links.
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <Section id={id} padding="sm" width="wide" className="scroll-mt-16">
      <Eyebrow className="mb-3">{title}</Eyebrow>
      {children}
    </Section>
  );
}

export function UiKitGallery() {
  const [room, setRoom] = useState<RoomPresetId>("study");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [extraMessages, setExtraMessages] = useState(0);
  const [reviewPly, setReviewPly] = useState<number | null>(8);
  const [hudAutoHide, setHudAutoHide] = useState(false);

  const rows = toHistoryRows(OPERA_SAN);
  const baseMessages = 5;

  return (
    <div className="min-h-dvh bg-background pb-24 text-[14px]">
      <Section padding="sm" width="wide" className="border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>Design system</Eyebrow>
            <Display level={3} className="mt-1">
              The <em>Study</em>, in parts
            </Display>
          </div>
          <ThemeToggle />
        </div>
      </Section>

      <Group title="Palette">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {TOKENS.map((token) => (
            <li key={token.name} className="rounded-xl border border-border bg-card p-2">
              <span
                aria-hidden
                className={`block h-10 rounded-md ring-1 ring-border ${token.className}`}
              />
              <span className="mt-2 block font-mono text-[11px] text-muted-foreground">
                {token.name}
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Type scale">
        <div className="flex flex-col gap-6">
          <Display level={1}>
            Chess you can <em>walk</em> around.
          </Display>
          <Display level={2}>Choose your room</Display>
          <Display level={3}>Meet the opponents</Display>
          <p className="max-w-prose text-[15px] text-muted-foreground">
            Sit at a board in a room you chose. Play people near your rating, or an AI that tells
            you what it thinks.
          </p>
          <p className="tabular font-mono text-[13px] text-muted-foreground">
            12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6
          </p>
        </div>
      </Group>

      <Group title="Stat pills">
        <div className="flex flex-wrap gap-2">
          <StatPill tone="live" dot value="14" label="playing now" />
          <StatPill value="1,204" label="games today" />
          <StatPill tone="brass" value="+18" label="rating" />
          <StatPill tone="danger" value="Check" />
        </div>
      </Group>

      <Group title="Player chips">
        <div className="flex flex-wrap items-start gap-8">
          <PlayerChip name="Magnus Ostergaard" rating={1240} side="w" toMove />
          <PlayerChip name="Pip" rating={800} side="b" subtitle="AI · Beginner" />
          <PlayerChip name="ada" rating={1400} size="sm" subtitle="Spectating" />
        </div>
      </Group>

      <Group title="Keys and shortcuts">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">
            Press <Kbd>F</Kbd> for fullscreen, <Kbd>?</Kbd> for help.
          </span>
          <ShortcutsDialog
            shortcuts={SHORTCUTS}
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
            trigger={
              <Button variant="outline" size="sm">
                <KeyboardIcon aria-hidden />
                Shortcuts
              </Button>
            }
          />
        </div>
      </Group>

      <Group title="Action bar">
        <div className="flex flex-col gap-3">
          <ActionBar label="Game actions">
            <ActionGroup>
              <ActionButton icon={BoxIcon} label="2D / 3D" shortcut="T" />
              <ActionButton icon={RotateCcwIcon} label="Flip" shortcut="R" />
              <ActionButton icon={CameraIcon} label="Camera" />
              <ActionButton icon={MaximizeIcon} label="Fullscreen" shortcut="F" />
            </ActionGroup>
            <ActionSeparator />
            <ActionGroup>
              <ActionButton icon={LightbulbIcon} label="Hint" variant="primary" badge="2 left" />
              <ActionButton
                icon={Undo2Icon}
                label="Take back"
                disabledReason="Undo is not available in online games."
              />
              <ActionButton icon={HandshakeIcon} label="Offer draw" />
              <ActionButton icon={FlagIcon} label="Resign" variant="danger" />
            </ActionGroup>
            <ActionSeparator />
            <ActionGroup>
              <ActionButton icon={DownloadIcon} label="PGN" />
              <ActionButton icon={SofaIcon} label="Room" />
            </ActionGroup>
          </ActionBar>
          <p className="text-[13px] text-muted-foreground">
            Labels collapse to icons below the <code className="font-mono">lg</code> breakpoint but
            stay in the accessibility tree; disabled actions keep their tooltip.
          </p>
        </div>
      </Group>

      <Group title="Chat">
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="flex h-[420px] flex-col rounded-xl border border-border bg-card">
            <ChatList
              messageCount={baseMessages + extraMessages}
              label="Commentary"
              footer={
                <Button className="w-full" onClick={() => setExtraMessages((n) => n + 1)}>
                  <LightbulbIcon aria-hidden />
                  Ask for a hint
                  <span className="tabular ml-auto text-[11px] opacity-80">2 left</span>
                </Button>
              }
            >
              <ChatMessage variant="system">Game started · Beginner</ChatMessage>
              <ChatMessage variant="ai" personaName="Pip" moveLabel="1. e4">
                {SAMPLE_LINES.pip}
              </ChatMessage>
              <ChatMessage variant="you">You played e5</ChatMessage>
              <ChatMessage variant="ai" personaName="Pip" moveLabel="2. Nf3" tag="Hint">
                Develop the knight before the bishop — it only has one good square here.
              </ChatMessage>
              {Array.from({ length: extraMessages }, (_, i) => (
                <ChatMessage key={i} variant="you">
                  Hint requested
                </ChatMessage>
              ))}
              <ChatMessage variant="thinking" personaName="Pip" stillThinkingAfterMs={3000} />
            </ChatList>
          </div>

          <div className="flex flex-col gap-3">
            <ul className="flex list-none flex-col gap-3 rounded-xl border border-border bg-card p-3">
              <ChatMessage variant="system">Draw offered</ChatMessage>
              <ChatMessage variant="ai" personaName="Kasparova" moveLabel="24. Qh5">
                {SAMPLE_LINES.kasparova}
              </ChatMessage>
              <ChatMessage variant="you">You played Nf3</ChatMessage>
              <ChatMessage variant="thinking" personaName="Viktor" stillThinkingAfterMs={0} />
            </ul>
            <p className="text-[13px] text-muted-foreground">
              Scroll the list on the left up, then add a message: the “New message” pill appears
              instead of yanking the view.
            </p>
          </div>
        </div>
      </Group>

      <Group title="Move list">
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          <div className="h-[320px] overflow-y-auto rounded-xl border border-border">
            <MoveList
              rows={rows}
              currentPly={reviewPly}
              onSelect={setReviewPly}
              renderAction={(ply) => (
                <Button size="xs" variant="secondary" onClick={() => setReviewPly(ply)}>
                  Rewind
                </Button>
              )}
            />
          </div>
          <div className="flex flex-col gap-2 text-[13px] text-muted-foreground">
            <p>
              Reviewing ply <span className="tabular font-mono text-foreground">{reviewPly ?? "—"}</span>.
            </p>
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setReviewPly(null)}>
              Back to live
            </Button>
            <MoveList rows={[]} className="rounded-xl border border-border" />
          </div>
        </div>
      </Group>

      <Group title="Mini boards">
        <div className="flex flex-wrap items-end gap-6">
          <figure className="flex flex-col gap-2">
            <MiniBoard fen={START_FEN} size={48} label="Starting position" />
            <figcaption className="font-mono text-[11px] text-muted-foreground">48px</figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            <MiniBoard
              fen={MIDGAME_FEN}
              size={160}
              lastMove={{ from: "b8", to: "d7" }}
              label="Opera Game after 11…Nbd7"
            />
            <figcaption className="font-mono text-[11px] text-muted-foreground">
              160px · last move
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            <MiniBoard
              fen={MATE_FEN}
              size={320}
              orientation="b"
              lastMove={{ from: "d1", to: "d8" }}
              label="Opera Game, final position"
            />
            <figcaption className="font-mono text-[11px] text-muted-foreground">
              320px · black orientation
            </figcaption>
          </figure>
        </div>
      </Group>

      <Group title="Room cards">
        <ul className="grid list-none grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ROOM_ORDER.map((id) => (
            <li key={id} className="flex">
              <RoomCard
                name={ROOMS[id].label}
                description={ROOMS[id].description}
                lightSquare={ROOMS[id].board.lightSquare}
                darkSquare={ROOMS[id].board.darkSquare}
                hdriName={ROOMS[id].hdri.replace("/hdri/", "")}
                active={room === id}
                onClick={() => setRoom(id)}
                onMouseEnter={() => setRoom(id)}
              />
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Podium">
        <Podium
          entries={[
            { rank: 1, name: "Kasparova", rating: 2300, record: "42-3-5" },
            { rank: 2, name: "Viktor", rating: 1800, record: "31-9-4" },
            { rank: 3, name: "Ada", rating: 1400, record: "27-12-8" },
          ]}
        />
      </Group>

      <Group title="Scroll reveal">
        <div className="flex flex-col gap-2">
          {["Rises once, when it scrolls into view.", "Staggered 60ms behind the one above.", "Static when the OS asks for reduced motion."].map(
            (line, i) => (
              <Reveal
                key={line}
                delayIndex={i}
                className="rounded-xl border border-border bg-card px-4 py-3 text-[13px] text-muted-foreground"
              >
                {line}
              </Reveal>
            ),
          )}
        </div>
      </Group>

      <Group title="Focus HUD">
        <div className="flex flex-col gap-3">
          <div className="relative h-[360px] overflow-hidden rounded-xl border border-border bg-bg-sunken">
            <div className="grid h-full place-items-center">
              <MiniBoard fen={MIDGAME_FEN} size={280} label="Board behind the HUD" />
            </div>
            <FocusHud
              autoHide={hudAutoHide}
              topLeft={<PlayerChip name="Pip" rating={800} side="b" toMove />}
              topRight={
                <Button size="sm" variant="secondary">
                  Exit fullscreen
                </Button>
              }
              bottom={
                <ActionBar label="Focus actions">
                  <ActionButton icon={BoxIcon} label="2D / 3D" shortcut="T" labelFrom="always" />
                  <ActionButton icon={RotateCcwIcon} label="Flip" shortcut="R" labelFrom="always" />
                  <ActionButton icon={CameraIcon} label="Camera" labelFrom="always" />
                  <ActionButton icon={MaximizeIcon} label="Exit" shortcut="Esc" labelFrom="always" />
                </ActionBar>
              }
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            aria-pressed={hudAutoHide}
            onClick={() => setHudAutoHide((v) => !v)}
          >
            Auto-hide: {hudAutoHide ? "on" : "off"}
          </Button>
        </div>
      </Group>
    </div>
  );
}
