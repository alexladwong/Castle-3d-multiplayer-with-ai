# Zustand 5.0.15 — client state for the 3D chess app

Verification basis (everything below was read, not recalled):

- Installed package: `/Users/sonnysangha/Documents/Builds/chess-3d-ai-clerk-game/node_modules/zustand` — `package.json`, `README.md`, `index.d.ts`, `vanilla.d.ts`/`vanilla.js`, `react.d.ts`/`react.js`, `shallow.d.ts`, `react/shallow.d.ts`/`.js`, `vanilla/shallow.d.ts`/`.js`, `traditional.d.ts`/`.js`, `middleware.d.ts`, `middleware.js`, `middleware/*.d.ts`.
- Official docs at the exact tag `v5.0.15`: `raw.githubusercontent.com/pmndrs/zustand/v5.0.15/docs/...` (`reference/migrations/migrating-to-v5.md`, `learn/guides/nextjs.md`, `reference/integrations/persisting-store-data.md`, `learn/guides/prevent-rerenders-with-use-shallow.md`). Note: `zustand.docs.pmnd.rs/migrations/migrating-to-v5` and `/guides/nextjs` now 404 — the site restructured to `learn/*` + `reference/*`.
- Compile/lint verified in **this repo** (`npx tsc --noEmit`, `npx eslint`) against React 19.2.8 + Next 16.3.4 + `reactCompiler: true` + `eslint-config-next@16.3.4`. Temp files were removed after verification.

Relevant requirements: FR-14 (selection/history survive the 2D↔3D toggle), FR-15 (`boardView` persisted per player), FR-24 (camera presets), FR-25 (camera state persists **for the session**), FR-31 (quality tier + frame-time watchdog), and `stockfish.md:292` ("wrap in a … zustand store" for the worker handle).

---

## 1. Entry points and exact signatures

| Import path | Exports | Source verified |
|---|---|---|
| `zustand` | `create`, `useStore` (re-export of `zustand/react`) + everything in `zustand/vanilla` | `index.d.ts` → `export * from 'zustand/vanilla'; export * from 'zustand/react'` |
| `zustand/vanilla` | `createStore`, types `StoreApi`, `StateCreator`, `ExtractState`, `Mutate`, `StoreMutatorIdentifier`, `StoreMutators` | `vanilla.d.ts` |
| `zustand/react` | `create`, `useStore`, type `UseBoundStore` | `react.d.ts` |
| `zustand/shallow` | `shallow` **and** `useShallow` (barrel re-export) | `shallow.d.ts`: `export { shallow } from 'zustand/vanilla/shallow'; export { useShallow } from 'zustand/react/shallow'` |
| `zustand/react/shallow` | `useShallow` only | `react/shallow.d.ts` |
| `zustand/vanilla/shallow` | `shallow` only | `vanilla/shallow.d.ts` |
| `zustand/traditional` | `createWithEqualityFn`, `useStoreWithEqualityFn` | `traditional.d.ts` — **do not use, see §2.4** |
| `zustand/middleware` | `redux`, `devtools` (+ `DevtoolsOptions`, `NamedSet`), `subscribeWithSelector`, `combine`, `persist`, `createJSONStorage`, types `StateStorage`, `StorageValue`, `PersistStorage`, `PersistOptions`, and `unstable_ssrSafe` | `middleware.d.ts` |
| `zustand/middleware/immer` | `immer` — **`immer` is NOT installed in this repo** (`require.resolve('immer')` → MODULE_NOT_FOUND). Don't import it without `pnpm add immer`. | `middleware/immer.js` |

**Both `zustand/shallow` and `zustand/react/shallow` resolve `useShallow` in v5.** The migration guide uses `zustand/shallow`; the README uses `zustand/react/shallow`. Either is fine — pick one and be consistent.

### `create` (React, `zustand/react`)

```ts
type Create = {
  <T, Mos extends [StoreMutatorIdentifier, unknown][] = []>(initializer: StateCreator<T, [], Mos>): UseBoundStore<Mutate<StoreApi<T>, Mos>>;
  <T>(): <Mos ...>(initializer: StateCreator<T, [], Mos>) => UseBoundStore<Mutate<StoreApi<T>, Mos>>;
};
```

The returned `UseBoundStore<S>` is a hook **plus** the whole store API glued on (`Object.assign(useBoundStore, api)` in `react.js`), so `useSettingsStore.getState()`, `.setState()`, `.subscribe()`, `.getInitialState()` and `.persist.*` are all available off the hook itself.

**Curried form is mandatory in TypeScript**: write `create<State>()(initializer)`, not `create<State>(initializer)`. README §"TypeScript Usage": *"Basic typescript usage doesn't require anything special except for writing `create<State>()(...)` instead of `create(...)`"*. The second overload above is exactly that. Same rule for `createStore<T>()(...)`. Without it, middleware mutator types (`persist`, `devtools`, `subscribeWithSelector`) do not thread through and `.persist`/3-arg `subscribe` disappear from the type.

### `createStore` (vanilla, `zustand/vanilla`)

Identical curried shape, returns `StoreApi<T>` instead of a hook:

```ts
interface StoreApi<T> {
  setState: (partial, replace?: false) => void;   // overload 2: (state: T | ((s:T)=>T), replace: true) => void
  getState: () => T;
  getInitialState: () => T;
  subscribe: (listener: (state: T, prevState: T) => void) => () => void;
}
```

`vanilla.js` internals worth knowing:
- `setState` bails out via `Object.is(nextState, state)` — returning the *same object* from an updater is a no-op, no listeners fire.
- Merge rule: `replace ?? (typeof nextState !== 'object' || nextState === null)` → **shallow, one level deep** `Object.assign({}, state, nextState)`. Nested objects (e.g. `roomColors`) are replaced wholesale, not deep-merged.
- Listeners fire **synchronously** inside `setState`.
- `getInitialState()` returns the object the initializer returned, captured once; it is never mutated afterwards. This is what `useStore` feeds to `useSyncExternalStore` as the server snapshot (§4).

### `useStore` (`zustand`, `zustand/react`)

```ts
function useStore<S extends ReadonlyStoreApi<unknown>>(api: S): ExtractState<S>;
function useStore<S extends ReadonlyStoreApi<unknown>, U>(api: S, selector: (state: ExtractState<S>) => U): U;
```

Implementation (`react.js`) — memorise this, it explains every v5 gotcha:

```js
const slice = React.useSyncExternalStore(
  api.subscribe,
  React.useCallback(() => selector(api.getState()), [api, selector]),
  React.useCallback(() => selector(api.getInitialState()), [api, selector]),
);
```

No equality function anywhere. React compares with `Object.is`. `getServerSnapshot` = selector over `getInitialState()`.

### `useShallow` (`zustand/shallow` | `zustand/react/shallow`)

```ts
function useShallow<S, U>(selector: (state: S) => U): (state: S) => U;
```

`react/shallow.js`: holds a `useRef`, and returns `prev.current` unchanged when `shallow(prev.current, next)` is true. It is a **selector wrapper**, not an equality argument — call it as `useMyStore(useShallow(s => ({...})))`.

`shallow` itself (`vanilla/shallow.js`) is one level deep and understands `Map`, `Set` and any iterable (it compares `entries()` for keyed collections and iterates otherwise), falling back to own-keys + `Object.is` per key.

### `subscribeWithSelector`

Adds a second `subscribe` overload on the store:

```ts
subscribe<U>(
  selector: (state: T) => U,
  listener: (selected: U, previousSelected: U) => void,
  options?: { equalityFn?: (a: U, b: U) => boolean; fireImmediately?: boolean },
): () => void
```

Default `equalityFn` is `Object.is` (`middleware.js`). `fireImmediately: true` calls the listener once with `(current, current)`. The 1-arg form still works. **This is the mechanism for reading state inside `useFrame` without re-rendering (§6).**

### `persist`

```ts
persist<T, Mps, Mcs, U = T>(initializer, options: PersistOptions<T, U>): StateCreator<...>
```

`PersistOptions` (verbatim field list from `middleware/persist.d.ts`):

| Option | Type | Default (from `middleware.js`) |
|---|---|---|
| `name` | `string` (**required**, must be unique per storage) | — |
| `storage` | `PersistStorage<PersistedState, PersistReturn> \| undefined` | `createJSONStorage(() => window.localStorage)` |
| `partialize` | `(state: S) => PersistedState` | `(state) => state` |
| `onRehydrateStorage` | `(state: S) => ((state?: S, error?: unknown) => void) \| void` | — |
| `version` | `number` | `0` |
| `migrate` | `(persistedState: unknown, version: number) => PersistedState \| Promise<PersistedState>` | — |
| `merge` | `(persistedState: unknown, currentState: S) => S` | `(p, c) => ({ ...c, ...p })` (shallow, persisted wins) |
| `skipHydration` | `boolean` | `false` |

Store API added by the middleware (`store.persist.*`): `setOptions`, `clearStorage`, `rehydrate(): Promise<void> | void`, `hasHydrated(): boolean`, `onHydrate(fn) => unsub`, `onFinishHydration(fn) => unsub`, `getOptions()`.

```ts
function createJSONStorage<S, R = unknown>(
  getStorage: () => StateStorage<R>,
  options?: { reviver?: (key, value) => unknown; replacer?: (key, value) => unknown },
): PersistStorage<S, unknown> | undefined
```

Runtime behaviours read out of `middleware.js` that matter here:

1. **`createJSONStorage` swallows the throw.** `try { storage = getStorage() } catch { return }` → on the server (`localStorage`/`sessionStorage` undefined) it returns `undefined`, and `persist` then takes the "no storage" branch, which `console.warn`s `[zustand persist middleware] Unable to update item '<name>', the given storage is currently unavailable.` on every `set`. Harmless but noisy; it is captured **once at store creation**, so a store instance created during SSR never gets storage back.
2. **Every `set` writes**: the middleware wraps both the initializer's `set` and `api.setState` to call `setItem()`, which does `storage.setItem(name, { state: partialize({...get()}), version })`. High-frequency writes (camera on every orbit frame) hit `JSON.stringify` + storage synchronously → **throttle camera saves** (§7).
3. **`partialize` receives a shallow copy** (`{ ...get() }`), and the result goes through `JSON.stringify`, so functions are dropped even with the default `partialize`. Never rely on that — always `partialize` explicitly.
4. **Rehydration replaces state**: `set(options.merge(migratedState, get() ?? configResult), true)` — `replace: true`. The default `merge` re-spreads `currentState` first so actions survive. **A custom `merge` must return the complete state including every action**, or you will wipe your action functions.
5. `hydrate()` bumps an internal `hydrationVersion` and aborts stale passes, so double-invocation (React 19 StrictMode effects) is safe.
6. `api.getInitialState` is re-pointed at the pre-hydration `configResult` — it is *not* updated by rehydration. This is what keeps SSR/CSR snapshots aligned (§4).
7. **v5 no longer writes to storage at store creation** (also backported to 4.5.5). If you need a randomised/derived initial value persisted, `setState` it explicitly after `create`.

### `devtools`

```ts
interface DevtoolsOptions extends Config { name?: string; enabled?: boolean; anonymousActionType?: string; store?: string }
devtools(initializer, devtoolsOptions?)
```

- `enabled` default: `enabled ?? process.env.NODE_ENV !== 'production'`, and it needs `window.__REDUX_DEVTOOLS_EXTENSION__` — otherwise it is a pass-through with zero cost.
- Wrapping adds a **third `setState` argument**: `set(partial, replace, nameOrAction)` where the action is a `string` or `{ type: string, ... }`. When omitted it uses `anonymousActionType` or parses the caller name off `new Error().stack`. Pass `undefined` for `replace` to keep merge semantics: `set({ boardView: v }, undefined, 'settings/setBoardView')`.
- Adds `store.devtools.cleanup()`.
- **It serialises the whole state to the extension on every action.** Do not put a `Worker`, `WebGLRenderer`, `THREE.Camera` or a `Chess` instance in a devtools-wrapped store.
- README note: `import type {} from '@redux-devtools/extension'` is needed for the devtools typing in some setups (not installed here; typing worked fine in this repo without it — verified by `tsc --noEmit`).

### `combine`

```ts
function combine<T extends object, U extends object, Mps, Mcs>(initialState: T, create: StateCreator<T, Mps, Mcs, U>): StateCreator<Write<T, U>, Mps, Mcs>
```

Implementation is literally `(...args) => Object.assign({}, initialState, create(...args))`. Its only purpose is **type inference without writing the state interface**: `create(combine({ selectedSquare: null as string | null }, (set) => ({ select: ... })))` infers the union. It does not need the curried `create<T>()` form. Fine for small stores; for this project the explicit interface is clearer and plays better with the provider pattern.

### `unstable_ssrSafe` (v5-only, undocumented on the site)

```ts
function ssrSafe<T, U, Mps, Mcs>(config: StateCreator<T, Mps, Mcs, U>, isSSR = typeof window === 'undefined'): StateCreator<T, Mps, Mcs, U>
```

On the server it replaces `set`/`api.setState` with a function that throws `Cannot set state of Zustand store in SSR`. Useful as a tripwire while building the provider store, but it is `unstable_`-prefixed — do not ship it in a hot path without a second look.

---

## 2. v4 → v5 breaking changes that will actually bite here

Source: `docs/reference/migrations/migrating-to-v5.md` @ v5.0.15, cross-checked against the installed `.d.ts`/`.js`.

Headline list from the doc: drop default exports; drop deprecated features; React 18 minimum; `use-sync-external-store` becomes a **peer** dependency; TypeScript 4.5 minimum; drop UMD/SystemJS; reorganised `package.json` entry points; drop ES5; stricter `setState` `replace` types; persist behavioural change; "other small improvements".

### 2.1 No equality function on `create`/`useStore` — `Object.is` only

v4's `useStore(selector, shallow)` second argument is gone from `zustand`'s `create`. Any selector that builds a **new object or array each call** now re-renders on every store change and, per the migration doc, *"may cause infinite loops"* with `Maximum update depth exceeded`.

```ts
// ❌ v4 habit — infinite loop / render storm in v5
const [sel, setSel] = useGameUi((s) => [s.selectedSquare, s.select]);
const { a, b } = useGameUi((s) => ({ a: s.x, b: s.y }));

// ✅ v5 — either one selector per value (preferred: primitives compare with Object.is)
const selectedSquare = useGameUi((s) => s.selectedSquare);
const select        = useGameUi((s) => s.select);

// ✅ or wrap in useShallow when you genuinely want a tuple/object
import { useShallow } from 'zustand/shallow';
const { selectedSquare, legalTargets } = useGameUi(
  useShallow((s) => ({ selectedSquare: s.selectedSquare, legalTargets: s.legalTargets })),
);
```

Same trap for computed arrays: `useGameUi(s => s.legalTargets.filter(...))` allocates every time — select `legalTargets` and filter in the component (or `useShallow` it).

### 2.2 Unstable fallbacks in selectors

```ts
// ❌ new function identity every render
const action = useStore((s) => s.action ?? (() => {}));
// ✅ hoist the fallback to module scope
const NOOP = () => {};
const action = useStore((s) => s.action ?? NOOP);
```

### 2.3 `setState(..., true)` is typed stricter

```
- setState: (partial: T | Partial<T> | ((s: T) => T | Partial<T>), replace?: boolean) => void
+ setState: (partial: T | Partial<T> | ((s: T) => T | Partial<T>), replace?: false) => void
+ setState: (state: T | ((s: T) => T), replace: true) => void
```

`store.setState({}, true)` no longer typechecks. Reset must supply the full object: `set({ ...initialState, ...actions }, true)` — or just `set(initialState)` (merge mode), which is what the skeleton below does. For a runtime-computed flag, the doc's workaround is `const args = [{...}, flag] as Parameters<typeof store.setState>; store.setState(...args)`.

### 2.4 `createWithEqualityFn` is unavailable in this repo as installed

`zustand/traditional` (`createWithEqualityFn`, `useStoreWithEqualityFn`) is the documented escape hatch back to v4 equality semantics, but it does `require('use-sync-external-store/shim/with-selector')`, and in v5 that package is a **peer dependency that is not installed here** — verified: `require.resolve('use-sync-external-store/shim/with-selector')` → `MODULE_NOT_FOUND`. Importing `zustand/traditional` today will fail at build. Use `useShallow`; only reach for `zustand/traditional` after `pnpm add use-sync-external-store`.

### 2.5 Persist no longer stores at creation

See §1 `persist` note 7. Relevant if you ever want to seed `boardView` from a WebGL capability probe (FR-15's "default 3D when WebGL is available") — probe on the client and `setState` it, don't try to compute it inside the initializer during SSR.

### 2.6 React 19 / `useSyncExternalStore`

Peer range is `react: ">=18.0.0"`; this repo runs React **19.2.8**, well inside it. `useStore` uses React's built-in `useSyncExternalStore` (only `zustand/traditional` needs the shim). Consequences:
- Updates from outside React (a Web Worker `onmessage`, a `useFrame` tick, an `OrbitControls` `onEnd`) are batched and safe — no `unstable_batchedUpdates` needed (that guidance was for pre-React-18).
- `subscribe` listeners still fire **synchronously**, so the transient/ref pattern in §6 sees values immediately.
- StrictMode double-mounting calls `persist.rehydrate()` twice; the `hydrationVersion` guard makes that a no-op.

### 2.7 React Compiler is ON in this repo (`next.config.ts: reactCompiler: true`)

Verified end-to-end in this repo (`tsc --noEmit` + `eslint` clean) for: the `createStore` + `subscribeWithSelector` factory, a Context provider using `useState(() => createStore())`, a `useShallow` selector inside a custom `useGameUi` hook, `persist` with `skipHydration` + `rehydrate()` in `useEffect`, and a `useFrame` component using `store.getState()` + a `subscribeWithSelector` transient subscription.

Rules from `docs/research/nextjs16-shadcn.md` §10 that interact with store code (`eslint-plugin-react-hooks@7.1.1` recommended, all **error** unless noted):
- `react-hooks/set-state-in-effect` — a React `setState` in a `useEffect` body errors. This is why the hydration flag lives **in the store** (set from `onRehydrateStorage`) rather than in a `useState` toggled from the effect. Calling `store.persist.rehydrate()` or `store.getState().foo()` from an effect is a plain function call and does **not** trip the rule (verified: eslint clean).
- `react-hooks/refs` — no `ref.current` reads/writes during render. `useShallow` does that internally, but it is library code in `node_modules` and is not linted.
- `react-hooks/incompatible-library` (warn) may eventually flag store hooks; nothing fired in this repo's verification.
- Per-component opt-out if the compiler ever mis-memoises a selector: `'use no memo'` at the top of the component.

---

## 3. Store topology for this project

Three stores, deliberately separated by lifetime and by what may touch devtools/storage:

| Store | Created with | Lifetime | Persistence | Holds |
|---|---|---|---|---|
| `gameUiStore` | `createStore` + React Context provider, one per game route | per game (resets on navigation) | none | FR-14 state: `selectedSquare`, `legalTargets`, `reviewIndex`, `promotion`, `hoveredSquare`, `lastMove` |
| `settingsStore` | `create` module singleton | app lifetime | `persist` → **`localStorage`**, `skipHydration` | FR-15 `boardView`, FR-31 `qualityTier`, `roomPreset`, `roomColors`, `boardFlipEnabled`, `postProcessing` |
| `cameraStore` | `create` module singleton | app lifetime | `persist` → **`sessionStorage`**, `skipHydration` | FR-24/FR-25 `position`, `target`, `zoom`, active `preset` |
| `engineStore` | `createStore` module singleton, **no devtools, no persist** | app lifetime | none | Stockfish `Worker` handle, `ready`, `thinking`, `depth`, `skillLevel`, pending resolvers |

Why `gameUiStore` is provider-scoped and the others are module singletons:

- The v5 Next.js guide's rule — *"No global stores … the store should be created per request"*, *"React Server Components should not read from or write to the store"* — exists because a module singleton on the **server** is shared across concurrent requests. `gameUiStore` is per-game and would otherwise leak selection between games/routes on client-side navigation, so it gets the provider. A provider store also makes FR-14 trivial: mount it above the board header so the 2D and 3D boards read the same instance and the toggle is a pure swap of the rendering subtree.
- `settingsStore`/`cameraStore` never receive server data — they start from static defaults and only diverge in a client effect (§4). No request state can leak, and a singleton keeps the toggle usable from anywhere (header, `/settings`, WebGL-failure toast in FR-19). The canonical player-level values still live in Convex `players.boardView` / `players.qualityTier` (§4.4 of the requirements); the zustand copy is the fast local mirror.
- `engineStore` is a plain vanilla store because a `Worker` must never be serialised — no `devtools` (it JSON-sends state on every action), no `persist`.

---

## 4. Next.js App Router: SSR, hydration, and the `boardView` flash

### 4.1 Why `persist` + a module singleton mismatches naively

With `skipHydration: false` (the default), on the client the store hydrates from `localStorage` **at module-evaluation time**, before React hydrates. The server rendered `boardView: '3d'` (the default), the browser may have `'2d'` stored.

Zustand v5 blunts this: `useStore` passes `() => selector(api.getInitialState())` as `getServerSnapshot`, and `persist` re-points `api.getInitialState` at the *pre-hydration* `configResult` (never mutated). So React's hydration pass sees the defaults and the markup matches. But immediately after hydration React re-reads `getSnapshot` and swaps to the persisted value — with a 2D↔3D toggle that means **mounting the wrong board and then tearing down a whole `<Canvas>`**. That is exactly the wasted work NFR-2a is trying to avoid.

### 4.2 The pattern to use: `skipHydration: true` + `rehydrate()` in an effect + a `hydrated` gate

Documented in `persisting-store-data.md` §`skipHydration` (*"the initial call for hydration isn't called, and it is left up to you to manually call `rehydrate()`"*) and §FAQ *"How can I check if my store has been hydrated"* (`onRehydrateStorage` writing a `_hasHydrated` field). Verified to typecheck and lint clean in this repo:

```tsx
// src/stores/settings-store.ts
'use client';
import { create } from 'zustand';
import { persist, createJSONStorage, devtools } from 'zustand/middleware';

export type BoardView = '2d' | '3d';
export type QualityTier = 'auto' | 'low' | 'medium' | 'high';

type SettingsState = {
  boardView: BoardView;
  qualityTier: QualityTier;
  roomPreset: string;
  boardFlipEnabled: boolean;
  postProcessing: boolean;
  hydrated: boolean;                // never persisted
};
type SettingsActions = {
  setBoardView: (v: BoardView) => void;
  setQualityTier: (q: QualityTier) => void;
  setRoomPreset: (r: string) => void;
  setHydrated: () => void;
};

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  devtools(
    persist(
      (set) => ({
        boardView: '3d',            // FR-15 default; downgraded to '2d' by the WebGL probe
        qualityTier: 'auto',
        roomPreset: 'study',
        boardFlipEnabled: false,
        postProcessing: true,
        hydrated: false,
        setBoardView:   (v) => set({ boardView: v },   undefined, 'settings/setBoardView'),
        setQualityTier: (q) => set({ qualityTier: q }, undefined, 'settings/setQualityTier'),
        setRoomPreset:  (r) => set({ roomPreset: r },  undefined, 'settings/setRoomPreset'),
        setHydrated:    ()  => set({ hydrated: true }, undefined, 'settings/setHydrated'),
      }),
      {
        name: 'chess3d:settings',
        version: 1,
        storage: createJSONStorage(() => localStorage),
        skipHydration: true,                       // ← nothing reads storage until we say so
        partialize: (s) => ({                      // ← `hydrated` deliberately excluded
          boardView: s.boardView,
          qualityTier: s.qualityTier,
          roomPreset: s.roomPreset,
          boardFlipEnabled: s.boardFlipEnabled,
          postProcessing: s.postProcessing,
        }),
        onRehydrateStorage: () => (state, error) => {
          if (error) console.error('[settings] rehydrate failed', error);
          state?.setHydrated();                    // fires after merge; triggers one re-render
        },
      },
    ),
    { name: 'settings', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
```

```tsx
// src/components/settings-hydrator.tsx — mount once, high in the client tree
'use client';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { useCameraStore } from '@/stores/camera-store';

export function StoreHydrator() {
  useEffect(() => {
    void useSettingsStore.persist.rehydrate();
    void useCameraStore.persist.rehydrate();
  }, []);
  return null;
}
```

```tsx
// consumer — gate anything whose DOM shape depends on a persisted value
const hydrated  = useSettingsStore((s) => s.hydrated);
const boardView = useSettingsStore((s) => s.boardView);
if (!hydrated) return <BoardSkeleton />;   // same markup server + first client render
return boardView === '3d' ? <Board3D /> : <Board2D />;
```

`rehydrate()` returns `Promise<void> | void` (sync storage → the thenable shim, so `void`-ing it is correct). Alternatives from the same doc, if you prefer not to keep `hydrated` in state: `store.persist.hasHydrated()` + `onHydrate`/`onFinishHydration` subscriptions in an effect — but that requires a React `setState` inside `useEffect`, which `react-hooks/set-state-in-effect` errors on in this repo. Stick with the in-store flag.

### 4.3 Camera persistence (FR-25) — `sessionStorage`

FR-25 says *"persists for the session"*, so `sessionStorage`, not `localStorage`:

```ts
// src/stores/camera-store.ts
'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type CameraPreset = 'white' | 'black' | 'top' | 'cinematic';
type Vec3 = [number, number, number];

type CameraStore = {
  position: Vec3; target: Vec3; preset: CameraPreset; hydrated: boolean;
  save: (c: { position: Vec3; target: Vec3 }) => void;
  setPreset: (p: CameraPreset) => void;
  setHydrated: () => void;
};

export const useCameraStore = create<CameraStore>()(
  persist(
    (set) => ({
      position: [0, 8, 9], target: [0, 0, 0], preset: 'white', hydrated: false,
      save: (c) => set(c),
      setPreset: (p) => set({ preset: p }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'chess3d:camera',
      storage: createJSONStorage(() => sessionStorage),   // FR-25: session scope
      skipHydration: true,
      partialize: (s) => ({ position: s.position, target: s.target, preset: s.preset }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
```

**Never call `save()` from `useFrame`** — every `set` on a persisted store does `partialize` + `JSON.stringify` + `sessionStorage.setItem` synchronously. Write it from drei's `OrbitControls`/`CameraControls` `onEnd`, or throttle to ~4 Hz. See §7.

### 4.4 Per-request provider store (`gameUiStore`)

Straight from `docs/learn/guides/nextjs.md` @ v5.0.15 — note the guide uses `useState(() => createStore())`, not `useRef`:

```ts
// src/stores/game-ui-store.ts   (no 'use client' needed — plain module, imported by client code)
import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';

export type Square = string;                       // chess.js Square
export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export type GameUiState = {
  selectedSquare: Square | null;
  legalTargets: Square[];
  reviewIndex: number | null;                      // null = live position
  promotion: { from: Square; to: Square } | null;  // FR-11 picker
  hoveredSquare: Square | null;
};
export type GameUiActions = {
  select: (sq: Square | null, targets?: Square[]) => void;
  clearSelection: () => void;
  setReviewIndex: (i: number | null) => void;
  openPromotion: (from: Square, to: Square) => void;
  closePromotion: () => void;
  setHovered: (sq: Square | null) => void;
  reset: () => void;
};
export type GameUiStore = GameUiState & GameUiActions;

const initial: GameUiState = {
  selectedSquare: null, legalTargets: [], reviewIndex: null, promotion: null, hoveredSquare: null,
};

export const createGameUiStore = (init: Partial<GameUiState> = {}) =>
  createStore<GameUiStore>()(
    subscribeWithSelector((set) => ({
      ...initial,
      ...init,
      select: (sq, targets = []) => set({ selectedSquare: sq, legalTargets: targets }),
      clearSelection: () => set({ selectedSquare: null, legalTargets: [] }),
      setReviewIndex: (i) => set({ reviewIndex: i }),
      openPromotion: (from, to) => set({ promotion: { from, to } }),
      closePromotion: () => set({ promotion: null }),
      setHovered: (sq) => set({ hoveredSquare: sq }),
      reset: () => set(initial),                    // merge-mode reset; avoids the replace:true typing
    })),
  );

export type GameUiStoreApi = ReturnType<typeof createGameUiStore>;
```

```tsx
// src/providers/game-ui-store-provider.tsx
'use client';
import { createContext, use, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createGameUiStore, type GameUiStore, type GameUiStoreApi } from '@/stores/game-ui-store';

const GameUiStoreContext = createContext<GameUiStoreApi | null>(null);

export function GameUiStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createGameUiStore());   // created once per mount, per request on the server
  return <GameUiStoreContext value={store}>{children}</GameUiStoreContext>;
}

export function useGameUiStoreApi(): GameUiStoreApi {
  const store = use(GameUiStoreContext);                 // React 19 `use()`; useContext also fine
  if (!store) throw new Error('useGameUi must be used within GameUiStoreProvider');
  return store;
}

export function useGameUi<T>(selector: (s: GameUiStore) => T): T {
  return useStore(useGameUiStoreApi(), selector);
}
```

Mount `<GameUiStoreProvider>` in the game route's layout, wrapping both the board header (the 2D/3D toggle) and the board — that is what makes FR-14 free: switching view unmounts one renderer and mounts the other while `selectedSquare` / `reviewIndex` / `promotion` sit untouched in the provider store.

React 19 allows `<Context value={...}>` without `.Provider` (verified: `tsc` clean). `.Provider` still works.

---

## 5. Selector rules of thumb for this codebase

```ts
// ✅ primitives — Object.is, no allocation, cheapest possible
const selected  = useGameUi((s) => s.selectedSquare);
const inReview  = useGameUi((s) => s.reviewIndex !== null);   // boolean, still stable

// ✅ actions — stable references (defined once in the initializer), select them individually
const select    = useGameUi((s) => s.select);

// ✅ arrays/objects straight off state — stable until replaced
const targets   = useGameUi((s) => s.legalTargets);

// ⚠️ derived collections need useShallow (or move the work into the component)
const isTarget  = useGameUi(useShallow((s) => new Set(s.legalTargets)));  // shallow understands Set

// ❌ never
const { a, b }  = useGameUi((s) => ({ a: s.x, b: s.y }));      // new object every store change
```

For the 64 squares: give each `<Square>` a primitive selector (`useGameUi(s => s.selectedSquare === sq)` and `useGameUi(s => s.legalTargets.includes(sq))`) rather than passing arrays down — 64 boolean subscriptions re-render only the two or three squares that actually changed. The `.includes` selector returns a boolean, so it is `Object.is`-stable.

---

## 6. react-three-fiber interop: never read the store with a hook inside the render loop

`useFrame` runs 60×/s outside React's render cycle. A `useStore` hook subscription causes a React re-render whenever the slice changes; inside a `<Canvas>` that means reconciling the scene graph. Two safe access patterns:

**a) Poll `getState()` inside the frame callback.** Zero subscriptions, always fresh (listeners are synchronous, so `getState()` never lags):

```tsx
'use client';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { useGameUiStoreApi } from '@/providers/game-ui-store-provider';

export function SelectionRing() {
  const store = useGameUiStoreApi();
  const ref = useRef<Group>(null);

  useFrame((_, delta) => {
    const { selectedSquare } = store.getState();   // no re-render
    if (!ref.current) return;
    ref.current.visible = selectedSquare !== null;
    ref.current.rotation.y += delta;               // FR-30 pulse
  });

  return <group ref={ref} />;
}
```

For the module-singleton stores this is simply `useSettingsStore.getState()` / `useCameraStore.getState()` (the API is glued onto the hook — §1).

**b) Transient subscription into a ref** when you want to *react* to a change rather than poll it (README §"Transient updates"). Requires `subscribeWithSelector` for the selector overload:

```tsx
const store = useGameUiStoreApi();
const selectedRef = useRef<string | null>(null);

useEffect(
  () => store.subscribe(
    (s) => s.selectedSquare,
    (sq) => { selectedRef.current = sq; },        // imperative, no render
    { fireImmediately: true },
  ),
  [store],                                        // subscribe returns the unsubscribe fn → valid cleanup
);
```

Both variants typecheck and lint clean in this repo (verified). Returning `store.subscribe(...)` directly from `useEffect` is the idiomatic cleanup and satisfies `exhaustive-deps`.

**Use the hook only where a React re-render is what you want** — the promotion picker (`promotion !== null` mounts an HTML dialog), the review-mode banner, the quality-tier `<Suspense>` swap, the 2D/3D toggle. Everything the renderer draws per frame goes through (a) or (b).

Note the naming collision: `@react-three/fiber` also exports a `useStore()` returning *its own* zustand root store (see `docs/research/r3f-drei.md`), and `useThree(selector)` is a zustand selector over it. Import `useStore` from `zustand` explicitly and alias r3f's if both appear in a file.

---

## 7. Project-specific gotchas checklist

- **Persisted stores write on every `set`.** Camera orbit → throttle or write on `onEnd`. Same for the FR-31 frame-time watchdog: keep the running fps samples in a `useRef`, and only `set` the *tier* when it actually changes.
- **Stockfish `Worker` in a store**: keep it in a dedicated `createStore` with no `persist` and no `devtools`. Store it as `worker: Worker | null` and dispose in the same place you created it; devtools would try to JSON-send it, and `persist` would `JSON.stringify` it to `{}`.
- **Don't put the `Chess` instance in a zustand store either** — it's a mutable class; mutating it will not fire listeners (`Object.is` bail-out) and it breaks devtools serialisation. Keep FEN/PGN strings in state (as the schema already does) and a `Chess` instance in a `useRef`/module scope.
- **`set` merges only one level.** `set({ roomColors: { lightSquare } })` drops `darkSquare`. Write `set((s) => ({ roomColors: { ...s.roomColors, lightSquare } }))`.
- **Two persisted stores must have different `name`s** — `chess3d:settings` (localStorage) and `chess3d:camera` (sessionStorage) here.
- **Bump `version` + write a `migrate`** the first time you change the persisted shape of `settings`; without `migrate`, a version mismatch logs `State loaded from storage couldn't be migrated since no migrate function was provided` and the stored state is discarded.
- **A custom `merge` must return the full state**, actions included (§1 persist note 4).
- **`create()` at module scope in a file also imported by a Server Component** is evaluated on the server; that's why the storage getter must be lazy (`createJSONStorage(() => localStorage)`, not `createJSONStorage(() => window.localStorage)` evaluated eagerly — both are lazy here, but the `window.` form throws on the server and is swallowed into the "storage unavailable" warning path). Mark the store modules `'use client'` to keep them off the server entirely.
- **`useShallow` must wrap the selector, not sit beside it.** `useStore(sel, useShallow)` is meaningless in v5.
- **Reset between games**: prefer remounting the `GameUiStoreProvider` (change its React `key`) over calling `reset()` — cheaper to reason about, and it also clears any transient subscriptions.

---

## Unverified / open questions

- **React Compiler + `useShallow` at runtime.** Static checks pass (`tsc` and `eslint` with `react-hooks@7.1.1` compiler rules, `reactCompiler: true`), but I did not run the app. `useShallow` mutates a ref during render, which is the sort of thing the compiler's memoisation can interact with. If a `useShallow` selector ever returns stale data, try `'use no memo'` on that component and re-test. Not observed, not disproven.
- **`react-hooks/incompatible-library`** (warn) did not fire on any zustand pattern in my probes, but I only exercised the five files described above — a larger surface may trip it.
- **Exact React 19 hydration behaviour with a non-`skipHydration` persisted store.** I traced `getServerSnapshot = selector(api.getInitialState())` in `react.js` and confirmed `persist` pins `getInitialState` to the pre-hydration result, which *should* mean no hydration-mismatch error, only a post-hydration swap. I did not render it to confirm React emits no warning. The `skipHydration` pattern above sidesteps the question entirely; use it.
- **`unstable_ssrSafe`** is present in v5.0.15's `middleware.d.ts`/`.js` but has no page in the v5.0.15 docs tree. Behaviour above is read straight from the implementation; API stability is not guaranteed by the `unstable_` prefix.
- **`@redux-devtools/extension` types.** The README says `import type {} from '@redux-devtools/extension'` is *required* for devtools typing; my `devtools(...)` skeleton typechecked without it and without the package installed. It may become necessary once `DevtoolsOptions`' inherited `Config` fields are used.
- **Whether `players.boardView`/`players.qualityTier` in Convex should be the source of truth over `localStorage`** on a fresh device, and who wins on conflict, is a product decision the requirements don't settle (FR-15 says "saved per player"). The zustand layer above assumes local-first with a Convex write-behind; confirm with the Convex research doc before wiring.
- **`stockfish` worker lifecycle inside a store** — I verified only that a plain `createStore` can hold arbitrary values; I did not verify the `stockfish@18.0.8` worker's own constructor/teardown API here. See `docs/research/stockfish.md`.
- I did not consult context7 for zustand; the installed package plus the version-tagged GitHub docs were authoritative and exact-version-matched.
