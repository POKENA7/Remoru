import type { MetadataRoute } from "next";

/**
 * PWA の manifest。
 *
 * design.md D7: この change では manifest とアイコンまで。**Service Worker は
 * 入れない。** Service Worker はプッシュ通知のためのものであり、使う change 4
 * と同時に入れる。いま入れると、何もしない Service Worker がキャッシュの挙動
 * だけ変えて、原因の分からない不具合の温床になる。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Remoru",
    short_name: "Remoru",
    description: "日常のちょっとしたことを書きとめて、忘れたころにクイズで思い出すアプリ",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3eee1",
    theme_color: "#c8401a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
