import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Barkat",
    short_name: "Barkat",
    description: "Self-hosted household bills, income and cushion, kept week by week.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d0d0d",
    theme_color: "#3a5a40",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
