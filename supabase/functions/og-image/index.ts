import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.substring(0, max) + '…';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const postId = url.searchParams.get("postId");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let title = "Kanisa Kiganjani - SDA Community for Spiritual growth, Youth and Learning";
  let description = "Kanisa Kiganjani is an online Seventh-day Adventist community platform where believers, youth, and church members share posts, discuss faith, learn courses, and connect digitally.";
  let imageUrl = "";

  // Fetch latest posts for the social preview
  const { data: latestPosts } = await supabase
    .from("posts")
    .select("title, content, category, author:profiles!posts_author_id_fkey(username)")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(4);

  const { count: postsCount } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true })
    .eq("status", "approved");

  const { count: membersCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true });

  if (postId) {
    const { data: post } = await supabase
      .from("posts")
      .select("title, content, image_urls, author:profiles!posts_author_id_fkey(username)")
      .eq("id", postId)
      .single();

    if (post) {
      title = `${post.title} - Kanisa Kiganjani`;
      description = post.content.substring(0, 155) + (post.content.length > 155 ? "..." : "");
      if (post.image_urls && post.image_urls.length > 0) {
        imageUrl = post.image_urls[0];
      }
    }
  }

  const statsText = `${postsCount || 0}+ Machapisho  •  ${membersCount || 0}+ Wanachama`;

  // Build post cards for the OG image
  const postCards = (latestPosts || []).map((post: any, i: number) => {
    const x = i < 2 ? 60 : 620;
    const y = i % 2 === 0 ? 200 : 370;
    const author = post.author?.username || 'Mwanachama';
    const postTitle = escapeXml(truncate(post.title, 38));
    const snippet = escapeXml(truncate(post.content, 65));
    const category = escapeXml(post.category || 'general');

    return `
      <rect x="${x}" y="${y}" width="520" height="140" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1"/>
      <circle cx="${x + 28}" cy="${y + 30}" r="14" fill="#3b82f6"/>
      <text x="${x + 28}" y="${y + 35}" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="white">${escapeXml(author.charAt(0).toUpperCase())}</text>
      <text x="${x + 50}" y="${y + 35}" font-family="Arial,sans-serif" font-size="14" fill="#94a3b8">@${escapeXml(truncate(author, 18))}</text>
      <rect x="${x + 380}" y="${y + 18}" width="${Math.min(category.length * 8 + 16, 120)}" height="24" rx="12" fill="#1e3a5f"/>
      <text x="${x + 380 + Math.min(category.length * 8 + 16, 120) / 2}" y="${y + 34}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#60a5fa">${category}</text>
      <text x="${x + 20}" y="${y + 70}" font-family="Arial,sans-serif" font-size="17" font-weight="bold" fill="#f1f5f9">${postTitle}</text>
      <text x="${x + 20}" y="${y + 100}" font-family="Arial,sans-serif" font-size="13" fill="#94a3b8">${snippet}</text>
      <line x1="${x + 20}" y1="${y + 118}" x2="${x + 500}" y2="${y + 118}" stroke="#334155" stroke-width="1"/>
      <text x="${x + 20}" y="${y + 132}" font-family="Arial,sans-serif" font-size="11" fill="#64748b">❤ Penda  •  💬 Maoni</text>
    `;
  }).join('');

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
        <stop offset="50%" style="stop-color:#1e293b;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#0f172a;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    
    <!-- Header bar -->
    <rect x="0" y="0" width="1200" height="160" fill="#0f172a" opacity="0.8"/>
    <text x="60" y="65" font-family="Arial,sans-serif" font-size="38" font-weight="bold" fill="white">Kanisa Kiganjani</text>
    <text x="60" y="100" font-family="Arial,sans-serif" font-size="18" fill="#94a3b8">SDA Community • Spiritual Growth • Youth • Learning</text>
    <text x="60" y="138" font-family="Arial,sans-serif" font-size="15" fill="#60a5fa">${escapeXml(statsText)}</text>
    
    <!-- "Latest threads" label -->
    <text x="60" y="185" font-family="Arial,sans-serif" font-size="14" font-weight="bold" fill="#64748b" letter-spacing="2">MACHAPISHO MAPYA</text>
    
    <!-- Post cards -->
    ${postCards}
    
    <!-- Footer -->
    <rect x="0" y="560" width="1200" height="70" fill="#0f172a" opacity="0.9"/>
    <text x="600" y="600" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#64748b">kanisakiganjani.com — Jiunge na jamii yetu leo!</text>
  </svg>`;

  const accept = req.headers.get("accept") || "";
  if (accept.includes("image") || url.pathname.endsWith("/og-image")) {
    return new Response(svg, {
      headers: {
        ...corsHeaders,
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=1800",
      },
    });
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />
  <meta property="og:type" content="website" />
  ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : ""}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
  <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />
</head>
<body></body>
</html>`;

  return new Response(html, {
    headers: { ...corsHeaders, "Content-Type": "text/html", "Cache-Control": "public, max-age=1800" },
  });
});
