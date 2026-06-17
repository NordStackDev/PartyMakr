import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PartyMakr",
    short_name: "PartyMakr",
    description: "Find fester i nærheden af dig — på et kort, ikke et feed.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#120d22",
    theme_color: "#120d22",
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
