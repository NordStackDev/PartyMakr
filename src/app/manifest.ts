import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PartyMakr",
    short_name: "PartyMakr",
    description: "Find fester i nærheden af dig på et kort, ikke i et feed.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14100b",
    theme_color: "#14100b",
    lang: "da",
    dir: "ltr",
    categories: ["social", "lifestyle", "entertainment"],
    icons: [
      { src: "/pm-mark.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pm-mark.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/pm-mark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
