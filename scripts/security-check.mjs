import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const index = read("index.html");
const config = read("config.js");
const auth = read("auth.js");
const migration = read("supabase/migrations/001_auth_approval.sql");

const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

assert(!/const\s+PW\s*=/.test(index), "공개 HTML에 공용 비밀번호 상수가 남아 있습니다.");
assert(!/dashboard-access\?token=/i.test(index), "공개 HTML에 URL 접근 토큰이 남아 있습니다.");
assert(!/const\s+(PROD|FIN|HDATA|PEER_Y2025|PEER_Q2026Q1|PEER_Q2026Q2)\s*=/.test(index), "공개 HTML에 보호 대상 데이터가 남아 있습니다.");
assert(!/sb_secret_|service_role/i.test(config), "config.js에 서버 전용 키가 포함되어 있습니다.");
assert(/signUp\(/.test(auth) && /signInWithPassword\(/.test(auth), "회원가입 또는 로그인 흐름이 누락됐습니다.");
assert(/admin_set_user_status/.test(auth), "관리자 승인 RPC 연결이 누락됐습니다.");
assert((migration.match(/enable row level security/gi) || []).length >= 4, "RLS 활성화 선언이 부족합니다.");
assert(/승인 회원이 대시보드 데이터 조회/.test(migration), "대시보드 승인 정책이 누락됐습니다.");
assert(/관리자 권한이 필요합니다/.test(migration), "관리자 권한 재검사가 누락됐습니다.");

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Security smoke checks passed.");

