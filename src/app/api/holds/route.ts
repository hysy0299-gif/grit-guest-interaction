import { put, list } from "@vercel/blob";

/**
 * 관람객이 만든 홀드가 쌓이는 곳.
 *
 * 이름과 한마디는 파일 이름 안에 실려 간다. 그래서 저장은 blob 쓰기
 * 한 번이고, 읽기는 목록 한 번이다. 따로 index를 두면 저장할 때마다
 * 읽고 고쳐 쓰느라 왕복이 세 번이 되고, 동시에 둘이 쓰면 하나가 사라진다.
 *
 * 이미지는 PNG 바이트 그대로 받는다. base64로 감싸면 3분의 1이 더 붙는다.
 *
 * 저장소는 Vercel Blob이다. 프로젝트에 Blob 스토어를 붙이면
 * `BLOB_READ_WRITE_TOKEN`이 자동으로 들어온다.
 */

export const dynamic = "force-dynamic";

// wall2/ 로 옮겨서 이전 기록을 두고 온다. 크롭이 바뀌어 예전 사각형은
// 지금 저장되는 것과 크기가 안 맞는다.
// 배포가 실제로 갱신됐는지 응답만 보고 확인하려고 둔다
const BUILD = "2026-09-06a";
const PREFIX = "wall2/";
const MAX_BYTES = 2_000_000;

export interface HoldEntry {
  id: number;
  name: string;
  note: string;
  hold: string;
  url: string;
}

type Meta = Pick<HoldEntry, "name" | "note" | "hold">;

const packMeta = (m: Meta) =>
  Buffer.from(JSON.stringify(m), "utf8").toString("base64url");

function unpackMeta(s: string): Meta {
  try {
    const m = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
    return {
      name: String(m.name ?? ""),
      note: String(m.note ?? ""),
      hold: String(m.hold ?? ""),
    };
  } catch {
    return { name: "", note: "", hold: "" };
  }
}

export async function GET() {
  // 스토어가 안 붙었는지, 붙었는데 읽기가 실패했는지 밖에서 구분할 수 있어야
  // 한다. 토큰 값은 절대 내보내지 않고 있는지 여부만 알린다.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { holds: [], error: "no blob store connected" },
      { status: 503 },
    );
  }

  try {
    const { blobs } = await list({ prefix: PREFIX, limit: 1000 });
    const holds: HoldEntry[] = [];

    for (const b of blobs) {
      // wall/<id>-<base64url meta>.png — id는 첫 하이픈 앞까지다.
      // base64url 안에 하이픈이 들어갈 수 있으므로 한 번만 자른다.
      const rest = b.pathname.slice(PREFIX.length);
      const cut = rest.indexOf("-");
      if (cut < 0 || !rest.endsWith(".png")) continue;
      const id = Number(rest.slice(0, cut));
      if (!Number.isFinite(id)) continue;
      holds.push({
        id,
        url: b.url,
        ...unpackMeta(rest.slice(cut + 1, -4)),
      });
    }

    holds.sort((a, b) => a.id - b.id);
    return Response.json({ holds });
  } catch (err) {
    console.error("wall read failed", err);
    // 무엇이 왜 실패했는지 밖에서 보여야 고칠 수 있다. 토큰 값은 안 나간다.
    return Response.json(
      {
        holds: [],
        error: "read failed",
        why: String(err instanceof Error ? err.message : err).slice(0, 200),
        build: BUILD,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const q = new URL(request.url).searchParams;
  const meta: Meta = {
    name: (q.get("name") ?? "").slice(0, 24),
    note: (q.get("note") ?? "").slice(0, 60),
    hold: (q.get("hold") ?? "").slice(0, 24),
  };

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return Response.json({ error: "no body" }, { status: 400 });
  }

  if (bytes.byteLength === 0) {
    return Response.json({ error: "empty" }, { status: 400 });
  }
  // 이보다 크면 굽는 쪽이 잘못된 것이다
  if (bytes.byteLength > MAX_BYTES) {
    return Response.json({ error: "too large" }, { status: 413 });
  }

  const id = Date.now();

  try {
    const image = await put(`${PREFIX}${id}-${packMeta(meta)}.png`, bytes, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    });
    return Response.json({ entry: { id, url: image.url, ...meta } });
  } catch (err) {
    console.error("wall write failed", err);
    return Response.json({ error: "write failed" }, { status: 500 });
  }
}
