<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/create-dda-stack@latest/assets/banner.svg" alt="LET PLAY !" width="800">
</p>

# create-dda-stack

Create a ready-to-code React Native app in one command.

## Quick start

```bash
npx create-dda-stack@latest
```

Answer a few questions and your app is ready. Works with npm, yarn, pnpm and bun.

## Pick a stack

| Stack | Best for |
| --- | --- |
| **Expo** | Starting fast. Pick Expo Router (file-based) or React Navigation |
| **React Native CLI** | Full native control |
| **Superapp** | A host app that loads sub-apps (Re.Pack + Module Federation) |

## What you get

Every app comes with:

- **Navigation** with bottom tabs (Home + Explore)
- **React Query** for data fetching
- **Axios** client with auth token handling
- **`.env`** config with types
- **ESLint + Prettier**, ready to run with `npm run lint`

You can also add:

- **State management**: Zustand or Redux Toolkit
- **NativeWind**: Tailwind CSS for React Native
- **Reactotron**: a desktop debugger

## Skip the questions

Pass flags to set up everything in one line:

```bash
npx create-dda-stack@latest my-app --stack expo --state zustand --pm pnpm --yes
```

| Flag | Options |
| --- | --- |
| `--stack` | `expo`, `rn-cli`, `superapp` |
| `--state` | `none`, `zustand`, `redux-toolkit` |
| `--pm` | `npm`, `yarn`, `pnpm`, `bun` |
| `--router` | `expo-router`, `react-navigation` (Expo only) |
| `--nativewind` | Add NativeWind |
| `--reactotron` | Add Reactotron |
| `--no-install` | Skip installing dependencies |
| `--yes` | Use defaults for anything not set |

See `npx create-dda-stack --help` for all flags, including version pinning.

## Requirements

Node.js 18 or newer.

## Contributing

```bash
pnpm install
pnpm dev     # run from source
pnpm build
```

## License

MIT
