// [id, label, swatch]. Picking a color turns the whole knit Hacky that swatch; original keeps the art as drawn.
export const colors=[['original','Original','#30445f'],['berry','Berry','#b35cd0'],['mint','Mint','#58bc94'],['sunset','Sunset','#ec886a'],['rose','Rose','#e77bb6'],['ice','Ice','#85cfe4']];
export const flairs=[['none','Just Hacky','none'],['stars','Star power','star'],['hearts','Love bug','heart']];
export const moves=[['idle','Chill','smile'],['bounce','Happy bounce','up'],['dance','Happy dance','music'],['hype','Victory hop','star']];
export const defaults={look:'knit',color:'original',flair:'none',move:'idle'},storageKey='hacky-style-v1';
// The recolor: one SVG feColorMatrix per color (Symbols in ui.jsx), shared by the Customizer preview (Pet) and the knit
// avatar (PersonAvatar) so they always match. Each pixel becomes the swatch times its luminance relative to the cream
// body's (about 0.87 in hacky-knit.webp and the avatars), so the knit shading stays and the navy screen stays dark.
const BODY_LUMA=0.87;
export const recolors=colors.filter(([id])=>id!=='original');
export function recolorMatrix(hex){const swatch=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255/BODY_LUMA);return [...swatch.flatMap(v=>[.299*v,.587*v,.114*v,0,0]),0,0,0,1,0].map(n=>+n.toFixed(4)).join(' ');}
export const recolorFilter=color=>recolors.some(([id])=>id===color)?`url(#hacky-color-${color})`:'none';
