import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_FORME360_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_FORME360_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll(values: {name:string;value:string;options:CookieOptions}[]){values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
  const {data:{user}}=await supabase.auth.getUser();
  // A password-recovery link establishes its session in the browser from the
  // one-time code. The server middleware cannot see URL fragments, so this
  // page must be reachable before the recovery session has been exchanged.
  const isPasswordResetPage = request.nextUrl.pathname === "/account/reset";
  if (!user && request.nextUrl.pathname.startsWith("/account") && !isPasswordResetPage) { const target=request.nextUrl.clone();target.pathname="/";target.searchParams.set("auth","required");return NextResponse.redirect(target); }
  return response;
}
export const config = { matcher: ["/account/:path*"] };
