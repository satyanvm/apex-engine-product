import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignIn() {
  return (
    <>
      <h1 className="display mb-7 text-[40px]">Welcome back</h1>
      <AuthForm mode="sign-in" />
    </>
  );
}
