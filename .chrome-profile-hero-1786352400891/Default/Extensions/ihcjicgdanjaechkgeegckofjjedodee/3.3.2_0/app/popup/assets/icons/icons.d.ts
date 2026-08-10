// Type declarations for SVG imports in webpack
// Used for bundling icons in injectable components

declare module '*.svg' {
  const content: string;
  export default content;
}
