# Bundled typefaces

Both faces are licensed under the SIL Open Font License 1.1, which permits
bundling and redistribution with an application.

| File | Family | Copyright | Licence |
| --- | --- | --- | --- |
| `inter-latin.woff2`, `inter-latin-ext.woff2` | Inter | The Inter Project Authors | [OFL 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt) |
| `noto-sans-arabic.woff2` | Noto Sans Arabic | The Noto Project Authors | [OFL 1.1](https://github.com/notofonts/arabic/blob/main/OFL.txt) |

Each file is the variable (100–900 weight) build, subset to the ranges declared
in the matching `@font-face` rule in `app/globals.css`. They are served from the
app's own origin so a build never depends on a font CDN and no third party
observes a visitor's IP.
