# 한신공영 대시보드 보안 설정

이 버전은 GitHub Pages에 화면만 배포하고, 회원·승인 상태·재무 데이터는 Supabase가 관리합니다.

## 1. 노출된 기존 값 폐기

기존 공개 커밋에 포함됐던 공용 비밀번호와 URL 접근 토큰은 삭제만 하지 말고 반드시 폐기하거나 재발급합니다. 외부 대시보드도 자체 로그인 또는 동일한 SSO를 적용하기 전에는 `config.js`에 연결하지 않습니다.

## 2. Supabase 프로젝트 생성

1. Supabase에서 새 프로젝트를 만듭니다.
2. Authentication > Providers에서 Email을 활성화합니다.
3. Confirm email을 활성화합니다.
4. Authentication > URL Configuration에 다음을 등록합니다.
   - Site URL: `https://sgs1008.github.io/hanshin-dashboard/`
   - Redirect URL: 운영 주소와 로컬 테스트 주소
5. 운영 전에는 회사 SMTP를 연결합니다.

## 3. 데이터베이스 설치

Supabase SQL Editor에서 다음 파일의 내용을 실행합니다.

`supabase/migrations/001_auth_approval.sql`

이 SQL은 다음 항목을 생성합니다.

- 회원 프로필과 승인 상태
- 일반회원/관리자 역할
- 승인 감사 이력
- 보호된 대시보드 데이터
- 승인된 회원만 데이터를 읽는 RLS 정책
- 관리자 전용 승인·반려 RPC

## 4. 기존 데이터를 비공개 DB에 등록

로컬 `private/` 폴더에는 다음 파일이 생성되어 있습니다.

- `private/dashboard-data.json`
- `private/seed-dashboard-data.sql`

이 폴더는 `.gitignore` 처리되어 GitHub에 올라가지 않습니다.

Supabase SQL Editor에서 `private/seed-dashboard-data.sql`을 한 번 실행합니다. 실행 후 Table Editor의 `dashboard_datasets`에 `main-dashboard` 행이 생겼는지 확인합니다.

기존 데이터를 다시 추출해야 하는 특별한 경우에만 아래 명령을 사용합니다.

```powershell
node scripts/extract-existing-data.mjs
```

현재 공개 `index.html`에서는 이미 데이터가 제거됐으므로, 보관된 `private/dashboard-data.json`을 삭제하지 마세요.

## 5. 사이트 연결 정보 입력

`config.js`의 두 값을 Supabase Dashboard > Connect에서 확인한 값으로 바꿉니다.

```javascript
supabaseUrl: "https://프로젝트ID.supabase.co",
supabasePublishableKey: "sb_publishable_..."
```

브라우저에는 publishable key만 넣을 수 있습니다. `sb_secret_...`, legacy `service_role`, 데이터베이스 비밀번호는 절대 `config.js`나 GitHub에 넣지 않습니다.

회사 이메일만 가입을 받으려면 다음처럼 설정합니다.

```javascript
allowedEmailDomains: ["회사도메인.co.kr"]
```

## 6. 최초 관리자 만들기

1. 배포한 사이트에서 본인 계정으로 가입 신청합니다.
2. 이메일 인증을 완료합니다.
3. Supabase SQL Editor에서 아래 SQL을 실제 관리자 이메일로 바꿔 실행합니다.

```sql
update public.profiles
set
  status = 'approved',
  approved_at = now(),
  updated_at = now()
where email = '관리자@회사도메인.co.kr';

update public.user_roles
set role = 'admin'
where user_id = (
  select id
  from public.profiles
  where email = '관리자@회사도메인.co.kr'
);
```

다시 로그인하면 왼쪽 메뉴에 `회원 승인`이 나타납니다.

## 7. 회원 승인 절차

1. 사용자가 가입 신청
2. 사용자가 이메일 인증
3. 계정 상태가 `pending`으로 생성
4. 관리자가 `회원 승인` 화면에서 신청자 확인
5. 승인하면 `approved`, 반려하면 `rejected`
6. 승인된 회원만 `dashboard_datasets` 조회 가능
7. 이미 승인된 회원은 관리자가 `suspended`로 즉시 정지 가능

## 8. 배포 전 보안 점검

- 로그아웃 상태에서 Supabase 데이터 조회가 거부되는지 확인
- 승인대기 계정으로 데이터 조회가 거부되는지 확인
- 승인 계정만 대시보드를 볼 수 있는지 확인
- 일반 회원이 `admin_set_user_status`를 호출할 수 없는지 확인
- 공개 HTML과 브라우저 Network 응답에 승인 전 재무 데이터가 없는지 확인
- GitHub 저장소에 secret key, 비밀번호, 토큰, `private/` 파일이 없는지 확인
- 관리자 계정에 MFA 적용
- 기존 Git 커밋의 비밀번호와 토큰을 모두 교체

## 외부 시스템 링크 주의

`config.js`의 `externalLinks`는 승인된 사용자에게 메뉴를 보여주는 기능일 뿐, 외부 시스템 자체를 보호하지 않습니다. 외부 시스템도 별도 인증을 적용한 경우에만 URL을 등록하세요. URL 쿼리에 `token`, `secret`, `password`, `apiKey` 같은 값을 넣으면 대시보드가 해당 링크를 표시하지 않습니다.

