// The part of opentype.js the link previews use (server/utils/og): it ships
// no types of its own.
declare module 'opentype.js' {
  export interface Path { toPathData: (decimals?: number) => string }
  export interface Glyph { advanceWidth?: number, getPath: (x: number, y: number, fontSize: number) => Path }
  export interface Font { unitsPerEm: number, charToGlyph: (char: string) => Glyph }
  const opentype: { parse: (buffer: ArrayBuffer) => Font }
  export default opentype
}
