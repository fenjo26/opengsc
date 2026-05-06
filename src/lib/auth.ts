import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";

const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://") ?? false;

export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  cookies: useSecureCookies ? {
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
    },
  } : undefined,
  pages: {
    signIn: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/webmasters.readonly",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return false;

      // ── Find the owner (first user ever created) ──────────────────────────
      const owner = await prisma.user.findFirst({ orderBy: { id: "asc" } });

      if (!owner) {
        // No users yet → first login, PrismaAdapter creates the user automatically.
        return true;
      }

      // ── Check if this Google account is already linked ────────────────────
      const existing = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: account.providerAccountId,
          },
        },
      });

      if (existing) {
        // Refresh tokens
        await prisma.account.update({
          where: { id: existing.id },
          data: {
            access_token:  account.access_token,
            refresh_token: account.refresh_token ?? existing.refresh_token,
            expires_at:    account.expires_at,
            id_token:      account.id_token,
          },
        });
      } else {
        // New Google account → link to owner as additional GSC account
        await prisma.account.create({
          data: {
            userId:            owner.id,
            type:              account.type,
            provider:          account.provider,
            providerAccountId: account.providerAccountId,
            refresh_token:     account.refresh_token,
            access_token:      account.access_token,
            expires_at:        account.expires_at,
            token_type:        account.token_type,
            scope:             account.scope,
            id_token:          account.id_token,
          },
        });
      }

      // If the OAuth email is different from the owner's email, redirect to settings 
      // instead of returning true. This prevents NextAuth from trying to create a new User 
      // and a new Account (which would crash due to the unique constraint).
      if (account.providerAccountId !== owner.email && user.email !== owner.email) {
        return "/settings";
      }

      user.id    = owner.id;
      user.email = owner.email!;
      user.name  = owner.name;
      user.image = owner.image;
      return true;
    },

    async session({ session, token }) {
      if (session?.user && token?.sub) {
        // @ts-ignore
        session.user.id = token.sub;
      }
      return session;
    },

    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
  },
};
