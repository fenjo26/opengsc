// Minimal typing for sql.js (used only by scripts/import-rag.ts — pure-WASM SQLite).
declare module "sql.js" {
  const initSqlJs: (config?: { locateFile?: (file: string) => string }) => Promise<any>;
  export default initSqlJs;
}
