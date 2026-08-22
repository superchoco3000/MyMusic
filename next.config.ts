import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Spotify CDN domains for album covers, playlist covers and avatars
      { protocol: "https", hostname: "i.scdn.co", pathname: "/**" },
      { protocol: "https", hostname: "mosaic.scdn.co", pathname: "/**" },
      { protocol: "https", hostname: "image-cdn-ak.spotifycdn.com", pathname: "/**" },
      { protocol: "https", hostname: "image-cdn-fa.spotifycdn.com", pathname: "/**" },
      // Deezer CDN (used by AuditSwipeDeckModal for track previews)
      { protocol: "https", hostname: "e-cdns-images.dzcdn.net", pathname: "/**" },
      { protocol: "https", hostname: "cdns-images.dzcdn.net", pathname: "/**" },
      // Spotify user profile photos (hosted on scdn subdomains)
      { protocol: "https", hostname: "*.scdn.co", pathname: "/**" },
      { protocol: "https", hostname: "*.spotifycdn.com", pathname: "/**" },
      // Unsplash placeholder images (used for default playlist covers like Liked Songs)
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
      { protocol: "https", hostname: "plus.unsplash.com", pathname: "/**" },
    ],
  },
};


export default nextConfig;

