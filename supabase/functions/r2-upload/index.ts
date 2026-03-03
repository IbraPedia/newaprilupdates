import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { S3Client, PutObjectCommand, GetObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const s3 = new S3Client({
  region: "auto",
  endpoint: Deno.env.get("R2_ENDPOINT")!,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
    secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  },
});

const BUCKET = Deno.env.get("R2_BUCKET_NAME") || "church-community-uploads";
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB (after client compression)
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const SIGNED_URL_EXPIRY = 60 * 60 * 24 * 60; // 60 days

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const { action } = await req.json();

    if (action === "presign-upload") {
      const { fileName, contentType, fileSize } = await parseBody(req);

      // Validate file type
      const isImage = ALLOWED_IMAGE_TYPES.includes(contentType);
      const isVideo = ALLOWED_VIDEO_TYPES.includes(contentType);
      if (!isImage && !isVideo) {
        return jsonResp({ error: "Unsupported file type" }, 400);
      }

      // Validate size
      if (isImage && fileSize > MAX_IMAGE_SIZE * 5) {
        return jsonResp({ error: "Image too large (max 5MB before compression)" }, 400);
      }
      if (isVideo && fileSize > MAX_VIDEO_SIZE) {
        return jsonResp({ error: "Video too large (max 50MB)" }, 400);
      }

      const ext = fileName.split(".").pop() || "bin";
      const key = `${userId}/${crypto.randomUUID()}.${ext}`;

      const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

      return jsonResp({ uploadUrl, key, contentType: isVideo ? "video" : "image" });
    }

    if (action === "presign-download") {
      const body = await req.clone().json();
      const { key } = body;
      if (!key) return jsonResp({ error: "Missing key" }, 400);

      const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
      const downloadUrl = await getSignedUrl(s3, command, { expiresIn: SIGNED_URL_EXPIRY });

      return jsonResp({ downloadUrl });
    }

    if (action === "presign-downloads") {
      const body = await req.clone().json();
      const { keys } = body;
      if (!keys || !Array.isArray(keys)) return jsonResp({ error: "Missing keys" }, 400);

      const urls: Record<string, string> = {};
      for (const key of keys) {
        const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
        urls[key] = await getSignedUrl(s3, command, { expiresIn: SIGNED_URL_EXPIRY });
      }

      return jsonResp({ urls });
    }

    return jsonResp({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("R2 upload error:", err);
    return jsonResp({ error: err.message || "Internal error" }, 500);
  }
});

async function parseBody(req: Request) {
  const body = await req.clone().json();
  return {
    fileName: body.fileName || "file.bin",
    contentType: body.contentType || "application/octet-stream",
    fileSize: body.fileSize || 0,
  };
}

function jsonResp(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
