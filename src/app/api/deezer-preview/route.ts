import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q) {
    return NextResponse.json({ previewUrl: null });
  }

  try {
    const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=5`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ previewUrl: null });
    }

    const data = await res.json();
    const firstTrack = data?.data?.find((item: { preview?: string }) => Boolean(item?.preview));
    const previewUrl = firstTrack?.preview ?? null;

    return NextResponse.json({ previewUrl });
  } catch (err) {
    console.warn("[deezer-preview] Error fetching Deezer preview:", err);
    return NextResponse.json({ previewUrl: null });
  }
}
