export const CHARACTER_IDS = ["runner_001", "runner_002"] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export type CharacterDefinition = {
  id: CharacterId;
  label: string;
  releaseLabel: string;
  url: string;
  available: boolean;
};

export const CHARACTERS: Record<CharacterId, CharacterDefinition> = {
  runner_001: {
    id: "runner_001",
    label: "男性",
    releaseLabel: "男性・公開版v4・5アニメーション",
    url: "/game/characters/runner_001/v4/CH_runner_001_Web_v4.glb",
    available: true,
  },
  runner_002: {
    id: "runner_002",
    label: "女性",
    releaseLabel: "女性・黒髪・修復候補v6・走行アニメーション復元版",
    url: "/game/characters/runner_002/v6/CH_runner_002_Web_v6.glb",
    available: true,
  },
};

export function isCharacterId(value: string | null): value is CharacterId {
  return value !== null && CHARACTER_IDS.includes(value as CharacterId);
}
