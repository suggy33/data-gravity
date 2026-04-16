import { supabase } from "@/lib/supabase-client";

export async function GET() {
  try {
    if (!supabase) {
      return Response.json(
        {
          status: "error",
          message:
            "Supabase not configured. Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
          url: process.env.NEXT_PUBLIC_SUPABASE_URL || "NOT SET",
          keyPresent: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        },
        { status: 500 },
      );
    }

    const { data, error } = await supabase
      .from("analyses")
      .select("count")
      .limit(1);

    if (error) {
      return Response.json(
        {
          status: "error",
          message: "Failed to connect to Supabase",
          error: error.message,
          details: error,
        },
        { status: 500 },
      );
    }

    return Response.json({
      status: "success",
      message: "Connected to Supabase successfully",
      tableExists: true,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message:
          error instanceof Error ? error.message : "Connection test failed",
        error: String(error),
      },
      { status: 500 },
    );
  }
}
