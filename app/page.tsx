import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import { GameClient } from "./game-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <>
      <header className="zdr-topbar">
        <Link href="/" className="zdr-logo">ZDR <span>01</span></Link>
        {user ? <span>{user.displayName}で参加中</span> : <a className="zdr-signin" href={chatGPTSignInPath("/")} target="_top">サインインしてランク戦へ</a>}
      </header>
      <GameClient signedIn={Boolean(user)} />
    </>
  );
}
