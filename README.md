# create-dda-stack

Scaffold a React Native project — RN CLI, Expo, or a Superapp (Module Federation host + remote) — with navigation, React Query, an Axios client, env config, optional state management (Zustand or Redux Toolkit), and your choice of package manager.

## Usage

```bash
pnpm create dda-stack
# or
npm create dda-stack@latest
# or
yarn create dda-stack
# or
bunx create-dda-stack
```

You'll be prompted for a project name, a stack, a state management library (Zustand, Redux Toolkit, or none), and a package manager. If your package manager isn't installed yet, the CLI offers to install it for you (via corepack for yarn/pnpm, or the official installer for bun).

## Stacks

- **React Native CLI** — bare workflow, full native control.
- **Expo** — managed workflow, fastest to start. Ships with a native bottom tab bar that automatically picks up iOS 26's Liquid Glass styling in a development build (`npx expo prebuild` / `expo run:ios`, not Expo Go).
- **Superapp (Module Federation)** — scaffolds a host app + a sub-app, wired with Re.Pack + Module Federation.

Every generated project includes:

- React Navigation (bottom tabs, Home + Explore screens as a starting point)
- React Query, pre-wired with a `QueryProvider`
- An Axios client with an auth-token interceptor (`AsyncStorage`-backed)
- `.env` / `.env.example` config, typed via `src/config/env.ts`

Optionally, pick a state management library and it's installed and set up for you:

- **Zustand** — a ready-to-use store in `src/store`, hook-based, no provider needed
- **Redux Toolkit** — a configured store with an example slice, typed `useAppDispatch` / `useAppSelector` hooks, and the `Provider` wired into the app

## Requirements

- Node.js ≥ 18

## Development

```bash
pnpm install
pnpm dev        # run the CLI from source (tsx)
pnpm build      # build dist/
pnpm typecheck
```

## License

MIT
