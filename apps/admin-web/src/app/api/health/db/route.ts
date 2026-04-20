import { NextResponse } from "next/server";
import { supabaseServerAnon } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = supabaseServerAnon();

    const { data, error } = await supabase
      .from("app_users")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: data ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}