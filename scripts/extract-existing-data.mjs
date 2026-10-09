import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const indexPath = path.join(root, "index.html");
const privateDir = path.join(root, "private");
const jsonPath = path.join(privateDir, "dashboard-data.json");
const sqlPath = path.join(privateDir, "seed-dashboard-data.sql");

const names = [
  "PROD",
  "FIN",
  "HDATA",
  "PEER_Y2025",
  "PEER_Q2026Q1",
  "PEER_Q2026Q2"
];

function findDeclaration(source, name) {
  const prefix = `const ${name}=`;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`${name} 선언을 찾지 못했습니다.`);

  const expressionStart = start + prefix.length;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = expressionStart; i < source.length; i += 1) {
    const ch = source[i];

    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{" || ch === "[") depth += 1;
    if (ch === "}" || ch === "]") depth -= 1;

    if (depth === 0 && ch === ";") {
      return {
        start,
        end: i + 1,
        expression: source.slice(expressionStart, i)
      };
    }
  }

  throw new Error(`${name} 선언의 끝을 찾지 못했습니다.`);
}

const source = fs.readFileSync(indexPath, "utf8");
const declarations = names.map((name) => ({
  name,
  ...findDeclaration(source, name)
}));

const payload = Object.fromEntries(
  declarations.map(({ name, expression }) => [
    name,
    vm.runInNewContext(`(${expression})`, Object.create(null), { timeout: 1000 })
  ])
);

fs.mkdirSync(privateDir, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const jsonForSql = JSON.stringify(payload).replaceAll("'", "''");
const sql = `-- Supabase SQL Editor에서 001_auth_approval.sql 적용 후 실행하세요.\n` +
  `insert into public.dashboard_datasets (dataset_key, period, payload, version, is_active)\n` +
  `values ('main-dashboard', 'current', '${jsonForSql}'::jsonb, 1, true);\n`;
fs.writeFileSync(sqlPath, sql, "utf8");

if (process.argv.includes("--strip")) {
  let stripped = source;
  for (const declaration of declarations.slice().sort((a, b) => b.start - a.start)) {
    stripped = stripped.slice(0, declaration.start) + stripped.slice(declaration.end);
  }
  fs.writeFileSync(indexPath, stripped, "utf8");
}

console.log(`Private JSON: ${jsonPath}`);
console.log(`Private seed SQL: ${sqlPath}`);
console.log(process.argv.includes("--strip") ? "Public HTML data blocks removed." : "HTML was not changed.");

