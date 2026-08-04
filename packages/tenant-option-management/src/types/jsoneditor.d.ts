/**
 * `jsoneditor` ships no type declarations, and the vendored editor component in
 * `app/modules/tenant-option-management/editor/` imports it directly.
 *
 * Declared as `any` deliberately: this is a third-party boundary, which is the one
 * place the TypeScript "Do's and Don'ts" guidance allows it. The vendored
 * component is a candidate for replacement by the published `ang-jsoneditor`
 * package — see the AP-22 follow-up.
 */
declare module 'jsoneditor' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JSONEditor: any;
  export default JSONEditor;
}
