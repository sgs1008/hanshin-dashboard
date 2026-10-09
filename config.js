window.HANSHIN_CONFIG = Object.freeze({
  // Supabase Dashboard > Connect에서 확인할 수 있습니다.
  // publishable key는 브라우저에 공개되어도 되지만, secret key는 절대 넣지 마세요.
  supabaseUrl: "YOUR_SUPABASE_URL",
  supabasePublishableKey: "YOUR_SUPABASE_PUBLISHABLE_KEY",

  // Supabase Authentication > URL Configuration에도 동일한 주소를 등록하세요.
  siteUrl: "https://sgs1008.github.io/hanshin-dashboard/",

  // 예: ["hanshin.co.kr"]. 비워 두면 모든 이메일 도메인을 받되 관리자가 승인합니다.
  allowedEmailDomains: [],

  // 외부 서비스 자체에도 별도의 인증이 적용된 경우에만 주소를 넣으세요.
  externalLinks: {
    bidReviewUrl: "",
    monthlyReportsUrl: ""
  }
});
