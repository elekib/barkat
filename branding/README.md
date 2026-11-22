# Barkat branding

The mark is a crescent cradling a coin, with a sparkle above and a faint starfield behind: a bowl holding what you have, under a sky of blessings. The small sizes (favicon, navbar) drop the starfield, since fine detail disappears below about 32px.

| File | Use |
| --- | --- |
| `barkat-logo.svg` / `.png` | Horizontal logo for light backgrounds. |
| `barkat-logo-dark.svg` | Horizontal logo for dark backgrounds. |
| `barkat-stacked.svg`, `barkat-stacked-dark.svg` | Icon above the name, for light and dark. |
| `barkat-icon.svg` / `.png` | Square app icon, green. |
| `barkat-icon-dark.svg` | Square app icon, near-black with a mint mark. |
| `barkat-mark.svg` | The mark alone in one colour (`currentColor`): set it with CSS. |
| `barkat-mark-light.svg`, `barkat-mark-dark.svg` | The mark alone in one brand colour for light and dark pages. |
| `favicon.svg`, `favicon.ico`, `favicon-16.png`, `favicon-32.png` | Browser icons (a larger mark so it holds up small). |
| `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Home-screen and PWA icons. The maskable one has extra margin. |
| `social-preview.svg` / `.png` | 1280x640 GitHub social preview. Upload under Settings > General > Social preview. |

In the README, use a `<picture>` with the light and dark logos (see the top of the repository README). In the app, the `Logo` component in `web/src/components/Logo.tsx` draws the same mark from the theme colours.

## Palette

| Colour | Hex | Use |
| --- | --- | --- |
| Green | `#2a8a64` to `#185a40` | Icon tile (gradient) |
| Ink green | `#1f6f50` | The original accent green |
| Mint | `#5cc49a` | Accent, dark theme; the coin on the green tile; the whole mark on dark |
| Cream | `#fbf7ec` | The crescent on the green tile |
| Near-black | `#0d0d0d` | Dark tile and dark pages |

The wordmark is Inter Bold (SIL Open Font License), converted to outlines, so the SVGs need no font installed.

## Regenerate

Every file here is generated. To change the mark or colours, edit `generate.mjs` and run:

```bash
cd branding
npm i --no-save opentype.js @fontsource/inter sharp
node generate.mjs
```

Then copy `favicon.svg` to `web/src/app/icon.svg`, `favicon.ico` to `web/src/app/favicon.ico`, `apple-touch-icon.png` to `web/src/app/apple-icon.png`, and the `icon-*.png` files to `web/public/`.
