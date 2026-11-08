import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create a workspace" };

export default function SignUp() {
  return (
    <>
      <h1 className="display mb-7 text-[40px]">Create a workspace</h1>
      <AuthForm mode="sign-up" />
    </>
  );
}
