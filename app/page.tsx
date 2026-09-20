import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import { GameEntry } from "./game-entry";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ screen?: string | string[] }> }) {
  const user = await getChatGPTUser();
  const screen = (await searchParams).screen;
  return <GameEntry
    signedIn={Boolean(user)}
    displayName={user?.displayName ?? null}
    signInHref={chatGPTSignInPath("/?screen=select")}
    startInSelection={screen === "select"}
  />;
}
