import type { NextConfig } from "next";

/**
 * 전시용 배포. 여기에는 전시 화면과 방명록 API만 있다.
 * 아카이빙 사이트는 cre8-26-2 저장소에서 따로 배포한다.
 *
 * 화면은 public/index.html 한 장이고 Next는 그걸 그대로 내보낸다.
 * Next가 필요한 이유는 /api/holds 하나 때문이다.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
