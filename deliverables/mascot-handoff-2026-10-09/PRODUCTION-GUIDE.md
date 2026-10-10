# Hacky mascot production handoff

Prepared for Nicolas Cadena. These are the six current frontend companion concepts, plus the original Hacky hero illustration.

## Start here

- `original-png/`: seven original transparent PNG files. These are the authoritative visual references.
- `lossless-webp/`: visually identical, smaller web assets.
- `reference-board.html`: open locally to review all six neutral poses with descriptions.
- `manifest.json`: dimensions, sizes and SHA-256 checksums.

Each six-look sheet is 1254 x 1254 pixels, arranged in a 2 x 2 grid. Each cell is 627 x 627. Pose order: top-left idle, top-right dance A, bottom-left dance B, bottom-right celebration. The additional hero illustration is 1222 x 1287. All PNGs carry alpha transparency. Black in a transparent-image viewer is not a painted background.

These are raster illustrations, not native SVGs, layered PSDs, rigs or vector masters. No editable vector paths exist in this handoff. WebP conversion is lossless; do not autotrace or upscale and describe that result as original vector artwork.

## Reference workflow for Higgsfield production

This is a creative brief and proposed workflow, not a claim about specific Higgsfield controls or export capabilities. Use whichever reference-image/video controls your selected model provides. For one character, use only its sheet. If a model interprets the sheet as four characters, crop the top-left 627 x 627 cell in your production editor before upload. Do not upload the six-character overview as an identity reference for a single mascot. The board clips source images for display; the original sheets remain unmodified.

Preserve transparency in the reference. If the chosen video model requires a background, use a plain neutral studio background and remove it in the production pipeline. Validate that edge colors and outlines survive compositing.

## Shared visual direction

Cute and playful for hackathon and anime-convention audiences. Oversized heads, compact bodies, friendly expressions, dark outlines, simple shading and cobalt costume accents link the family together. The app uses navy #172B4D and cobalt #1D539F; illustrations have their own painted hues, so use the actual images as character-color authority. Yellow and small red details are accents, not a reason to recolor the entire app. These mascots are concept assets; this package does not assert MLH endorsement.

## Classic Bot

Reference: `original-png/hacky-classic.png`

The default Hacky: a white rounded robot head with a cyan screen, happy face, blue ear pieces with yellow centers, a yellow lightning antenna, cobalt hoodie with red drawstrings, white limbs, and blue-and-white sneakers.

Identity constraints: Keep the screen shape, lightning antenna, hoodie, ear pieces and compact proportions. Avoid turning the face into a human face.

Suggested reference prompt:

> Preserve the exact character identity from the supplied reference: silhouette, face, outfit, colors and defining accessories. Clean cute anime convention mascot, bold dark outlines, smooth simple shading, readable at small sizes, joyful and approachable. Full body stays in frame. One character only. No text, logos, watermark, extra limbs, costume changes, camera cuts or background clutter. Keep the screen shape, lightning antenna, hoodie, ear pieces and compact proportions. Avoid turning the face into a human face. Using this character as the identity reference, create a short seamless happy dance loop. Start in the neutral standing pose, gently bounce, lean left and right, raise the arms, celebrate, then return precisely to the starting pose. Locked camera, stable scale and position, consistent lighting. Keep the outline and face stable. Leave generous clear space around the body.

## Mochi

Reference: `original-png/hacky-mochi.png`

A cream-colored, rounded mochi creature with an oversized soft head, tiny limbs, sparkling dark eyes, pink cheeks, a yellow lightning tuft, and a cropped cobalt hoodie with red drawstrings and yellow tips.

Identity constraints: Keep the cream body and squishy silhouette. Use gentle squash and stretch without changing the costume.

Suggested reference prompt:

> Preserve the exact character identity from the supplied reference: silhouette, face, outfit, colors and defining accessories. Clean cute anime convention mascot, bold dark outlines, smooth simple shading, readable at small sizes, joyful and approachable. Full body stays in frame. One character only. No text, logos, watermark, extra limbs, costume changes, camera cuts or background clutter. Keep the cream body and squishy silhouette. Use gentle squash and stretch without changing the costume. Using this character as the identity reference, create a short seamless happy dance loop. Start in the neutral standing pose, gently bounce, lean left and right, raise the arms, celebrate, then return precisely to the starting pose. Locked camera, stable scale and position, consistent lighting. Keep the outline and face stable. Leave generous clear space around the body.

## Cyber Cat

Reference: `original-png/hacky-cat.png`

A lavender kitten with oversized pointed ears, pink inner ears and cheeks, sparkling dark eyes with yellow star highlights, a cobalt hoodie with a yellow lightning emblem, and a lavender tail ending in a yellow lightning shape.

Identity constraints: Keep the large ears, lavender fur and lightning tail. Preserve four paws and one tail; avoid extra limbs.

Suggested reference prompt:

> Preserve the exact character identity from the supplied reference: silhouette, face, outfit, colors and defining accessories. Clean cute anime convention mascot, bold dark outlines, smooth simple shading, readable at small sizes, joyful and approachable. Full body stays in frame. One character only. No text, logos, watermark, extra limbs, costume changes, camera cuts or background clutter. Keep the large ears, lavender fur and lightning tail. Preserve four paws and one tail; avoid extra limbs. Using this character as the identity reference, create a short seamless happy dance loop. Start in the neutral standing pose, gently bounce, lean left and right, raise the arms, celebrate, then return precisely to the starting pose. Locked camera, stable scale and position, consistent lighting. Keep the outline and face stable. Leave generous clear space around the body.

## Pocket Dragon

Reference: `original-png/hacky-dragon.png`

A mint-green baby dragon with yellow horns, a teal crest and spots, small teal wings, a cream segmented belly, tiny fangs, pink cheeks, a curled tail, and a cobalt neckerchief.

Identity constraints: Keep the two horns, small wings, cream belly and scarf. The character is friendly and compact, never intimidating.

Suggested reference prompt:

> Preserve the exact character identity from the supplied reference: silhouette, face, outfit, colors and defining accessories. Clean cute anime convention mascot, bold dark outlines, smooth simple shading, readable at small sizes, joyful and approachable. Full body stays in frame. One character only. No text, logos, watermark, extra limbs, costume changes, camera cuts or background clutter. Keep the two horns, small wings, cream belly and scarf. The character is friendly and compact, never intimidating. Using this character as the identity reference, create a short seamless happy dance loop. Start in the neutral standing pose, gently bounce, lean left and right, raise the arms, celebrate, then return precisely to the starting pose. Locked camera, stable scale and position, consistent lighting. Keep the outline and face stable. Leave generous clear space around the body.

## Star Sprite

Reference: `original-png/hacky-star.png`

A peach-colored floating sprite with a tapered head ending in a yellow star, large sparkling eyes, pink cheeks, a scalloped lower body, tiny hands and feet, and a flowing cobalt scarf.

Identity constraints: Keep the star tip, peach body, scalloped silhouette and scarf. Use light floating motion and gentle scarf follow-through.

Suggested reference prompt:

> Preserve the exact character identity from the supplied reference: silhouette, face, outfit, colors and defining accessories. Clean cute anime convention mascot, bold dark outlines, smooth simple shading, readable at small sizes, joyful and approachable. Full body stays in frame. One character only. No text, logos, watermark, extra limbs, costume changes, camera cuts or background clutter. Keep the star tip, peach body, scalloped silhouette and scarf. Use light floating motion and gentle scarf follow-through. Using this character as the identity reference, create a short seamless happy dance loop. Start in the neutral standing pose, gently bounce, lean left and right, raise the arms, celebrate, then return precisely to the starting pose. Locked camera, stable scale and position, consistent lighting. Keep the outline and face stable. Leave generous clear space around the body.

## Pixel Pal

Reference: `original-png/hacky-pixel.png`

A pixel-style blue robot with a cyan face screen, round yellow antenna, yellow ear centers, blue hoodie with a yellow chest panel and white drawstrings, white hands, and red-and-white sneakers.

Identity constraints: Preserve crisp stepped edges and the pixel aesthetic. Do not smooth it into the Classic Bot style or change the antenna into a lightning bolt.

Suggested reference prompt:

> Preserve the exact character identity from the supplied reference: silhouette, face, outfit, colors and defining accessories. Clean cute anime convention mascot, bold dark outlines, smooth simple shading, readable at small sizes, joyful and approachable. Full body stays in frame. One character only. No text, logos, watermark, extra limbs, costume changes, camera cuts or background clutter. Preserve crisp stepped edges and the pixel aesthetic. Do not smooth it into the Classic Bot style or change the antenna into a lightning bolt. Using this character as the identity reference, create a short seamless happy dance loop. Start in the neutral standing pose, gently bounce, lean left and right, raise the arms, celebrate, then return precisely to the starting pose. Locked camera, stable scale and position, consistent lighting. Keep the outline and face stable. Leave generous clear space around the body.

## Animation set to produce

- Idle: a subtle breathing or bobbing loop, with one blink.
- Wave: a friendly greeting, returning to the idle pose.
- Happy dance: a compact side-to-side dance with arms raised.
- Thinking/searching: a curious head tilt or tiny look around, keeping the character cheerful.
- Match found: a brief delighted celebration that settles back to idle.

Suggested starting brief: 3-4 second seamless idle or dance loops, locked camera and stable framing. Treat timings as production suggestions, not existing exports. The prototype currently cycles four illustrated poses and adds CSS motion; it has no skeletal rig or production video animation.

## Clean export acceptance criteria

Keep all extremities and accessories inside the canvas. Check small-size readability, silhouette consistency, no extra limbs or changing costume details, no outline flicker, no baked text or watermark, and a matching first/last pose for loops. Preview against white and dark surfaces. Preserve alpha where supported; use the actual intended background otherwise. Pixel Pal should retain pixel edges. Review every animation at both native size and approximately 96 px high, the phone-app usage size.

The tint options in the prototype use CSS filters over the entire character, not newly painted variants. Do not treat them as six separately approved character colorways.
