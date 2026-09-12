# Astravestis

Design system and shared UI component library for the Astrarium ecosystem.

> [!NOTE]
> **Status: Work in Progress (WIP)**  
> Astravestis is currently in active design. Its component library will provide reusable UI primitives, buttons, panels, and style tokens across Astrarium web tools.

---

## Development with Storybook

Launch the interactive Storybook component catalog:

```bash
# From workspace root
vp -C astravestis run storybook
# or: pnpm --filter @astrarium/astravestis storybook

# Or within this directory
vp run storybook
# or: pnpm storybook
```

Storybook will open at `http://localhost:6006`.

---

## Build

Compile component TypeScript types and production distribution:

```bash
vp build
# or: pnpm build
```
